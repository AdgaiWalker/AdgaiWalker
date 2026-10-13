/**
 * 内容上线用例层（PRD A7–A11、TECH-DESIGN §5.2/§6.2/D2）
 *
 * 为什么异步触发（不在请求内等构建）：
 * 上线是重操作（gen + commit + push + Vercel 部署，可达数分钟），请求内阻塞既拖垮网关超时，
 * 也让「事实时间线 + 轮询」失去意义。因此 release 只做原子互斥登记与派发，立即返回
 * `{ runId, status: 'RUNNING' }`；结果（退出码、耗时、输出尾部）由同一 trace.jsonl 如实落痕，
 * 前端经 `GET /runs/:runId/trace` 轮询读到 run.end / run.error 即为终态（诚实原则）。
 */
import { HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  missingPublishedPostFields,
  verifyPublicSnapshot,
  contentApprovalBindingKey,
  toPublicSnapshotSource,
  publicItemHash,
  grantAllows,
  type ContentApproval,
  type ContentChange,
  type ContentIndexSyncState,
  type ContentRelease,
  type ContentReleaseStage,
  type ContentVersionSnapshot,
  type PublishedPostRequiredField,
  type ReleaseCancelResult,
  type ReleaseManifest,
  type ReleaseManifestItem,
  type ReleasePreflightResult,
  type ReleaseReconcileNextAction,
  type ReleaseReconcileResult,
  type ReleaseResult,
  type ReleaseScopeConflict,
  type ReleaseVerificationResult,
} from '@walker/shared';
import { CONTENT_CHANGE_REPOSITORY, type ContentChangeRepositoryPort } from '../ports/content-change.repository';
import { AUTHORIZATION_REPOSITORY, type AuthorizationRepositoryPort } from '../ports/authorization.repository';
import { GIT_STATUS, type GitStatusPort } from '../ports/git-status.repository';
import { CONTENT_FILE_REPOSITORY, type ContentFileRepositoryPort } from '../ports/content-file.repository';
import { CONTENT_LOCK, type ContentLockPort, type ContentLockRecord } from '../ports/content-lock.port';
import { CONTENT_RELEASE_REPOSITORY, type ContentReleaseRepositoryPort } from '../ports/content-release.repository';
import {
  PUBLIC_SNAPSHOT_REPOSITORY,
  type PublicSnapshotRepositoryPort,
  type VerifiedPublicSnapshot,
} from '../ports/public-snapshot.repository';
import {
  WEBSITE_DEPLOYMENT_VERIFIER,
  type WebsiteDeploymentVerifierPort,
} from '../ports/website-deployment-verifier.port';
import { ApiError, validationError } from '../common/http-error';
import {
  CONTENT_LEDGER_REPOSITORY,
  type ContentLedgerRepositoryPort,
} from '../ports/content-ledger.repository';
import {
  CONTENT_RELEASE_RUNNER,
  type ContentReleaseRunnerPort,
  type ReleaseProcessResult,
} from '../ports/content-release-runner.port';
import { TRACE_WRITER, type TraceAppendInput, type TraceWriterPort } from '../ports/trace.repository';
import { OPERATIONS_JOURNAL, type OperationsJournalPort } from '../ports/operations-journal.port';

/** 输出尾部保留行数（PRD A10：失败回显原始输出尾部若干行） */
const RELEASE_TAIL_LINES = 12;
/** run.error.message 的字节上限：按 JSON 转义后计（引号/换行会膨胀），留出信封余量保证 payload ≤2000B */
const RELEASE_MESSAGE_MAX_BYTES = 1_400;
/** 绝对路径一律脱敏：轨迹 payload 禁放绝对路径（TECH-DESIGN §4.1/§8 #5） */
const ABSOLUTE_PATH_RE =
  /(?:[A-Za-z]:\\[^\s"']+|\/(?:Users|home|var|tmp|private|opt|mnt)\/[^\s"']*)/g;

export type {
  ReleaseVerificationResult,
  ReleaseReconcileNextAction,
  ReleaseReconcileResult,
  ReleaseCancelResult,
  ReleaseManifestItem,
  ReleaseManifest,
  ReleaseScopeConflict,
  ReleasePreflightResult,
  ReleaseResult,
};

/**
 * 解析脚本 `--json` 回报（最后一行 JSON）。
 * 解析不到返回 null —— 进程被超时强杀时根本没有机会输出，此时退回原始 stdout/stderr（如实）。
 */
function parseJsonReport(stdout: string): { tail: string[] } | null {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (!line.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(line) as { tail?: unknown };
      if (Array.isArray(parsed.tail)) {
        return {
          tail: parsed.tail.filter((item): item is string => typeof item === 'string'),
        };
      }
    } catch {
      /* 不是 JSON 行：继续往前找 */
    }
  }
  return null;
}

function redactAbsolutePaths(line: string): string {
  return line.replace(ABSOLUTE_PATH_RE, '<path>');
}

function fitMessage(text: string): string {
  let out = text;
  // 按 JSON 转义后的字节数裁剪：引号/反斜杠会膨胀，直接按原文字节算会顶破 2000B 上限
  while (
    out.length > 0 &&
    Buffer.byteLength(JSON.stringify(out), 'utf8') > RELEASE_MESSAGE_MAX_BYTES
  ) {
    out = out.slice(0, Math.max(0, out.length - 64));
  }
  return out;
}

@Injectable()
export class ContentReleaseService {
  private readonly log = new Logger(ContentReleaseService.name);
  /** 进程内单实例锁：同一时刻只允许一个发布进程，记录当前运行归属与控制器（PRD A9 / C19） */
  private running: {
    runId: string;
    releaseId?: string;
    slug: string;
    pid?: number;
    abortController?: AbortController;
  } | null = null;

  constructor(
    @Inject(CONTENT_RELEASE_RUNNER)
    private readonly runner: ContentReleaseRunnerPort,
    @Inject(TRACE_WRITER) private readonly trace: TraceWriterPort,
    @Inject(CONTENT_LEDGER_REPOSITORY)
    private readonly entries: ContentLedgerRepositoryPort,
    @Optional() @Inject(GIT_STATUS)
    private readonly git?: GitStatusPort,
    @Optional() @Inject(CONTENT_FILE_REPOSITORY)
    private readonly files?: ContentFileRepositoryPort,
    @Optional() @Inject(CONTENT_LOCK)
    private readonly contentLock?: ContentLockPort,
    @Optional() @Inject(CONTENT_RELEASE_REPOSITORY)
    private readonly releasesRepo?: ContentReleaseRepositoryPort,
    @Optional() @Inject(WEBSITE_DEPLOYMENT_VERIFIER)
    private readonly websiteVerifier?: WebsiteDeploymentVerifierPort,
    @Optional() @Inject(PUBLIC_SNAPSHOT_REPOSITORY)
    private readonly publicSnapshots?: PublicSnapshotRepositoryPort,
    @Optional() @Inject(CONTENT_CHANGE_REPOSITORY)
    private readonly changesRepo?: ContentChangeRepositoryPort,
    @Optional() @Inject(AUTHORIZATION_REPOSITORY)
    private readonly grants?: AuthorizationRepositoryPort,
    @Inject(OPERATIONS_JOURNAL)
    private readonly journal?: OperationsJournalPort,
  ) {}

  /**
   * 上线前预检：只读门禁校验，**零写动作**（PRD A7）。
   * 不跑 content:gen、不落盘、不碰 git——预检失败时工作区与 content/log 逐字节不变。
   */
  async preflight(slug: string): Promise<ReleasePreflightResult> {
    const entry = await this.entries.get(slug);
    if (!entry) {
      throw new ApiError('content-not-found', HttpStatus.NOT_FOUND, '内容不存在');
    }
    const missing = [...missingPublishedPostFields(entry.frontmatter)];
    if (missing.length > 0) {
      return { ok: false, missing, targetSlug: slug, targetHash: null, manifest: null, scopeConflict: null };
    }

    const doc = await this.files?.get(slug);
    if (!doc) throw new ApiError('content-not-found', HttpStatus.NOT_FOUND, '发布正本文件不存在');
    const targetHash = doc.hash;
    const publicHash = publicItemHash(
      toPublicSnapshotSource({ slug, data: entry.frontmatter, body: doc.raw.replace(/^---[\s\S]*?---\r?\n?/, '') }),
      (text) => createHash('sha256').update(text).digest('hex'),
    );

    if (!this.git?.workspaceSnapshot) {
      return {
        ok: false, missing: [], targetSlug: slug, targetHash, publicHash, manifest: null,
        scopeConflict: { reason: 'git-unavailable', message: 'Git 状态不可用，无法进行发布预检', details: [] },
      };
    }

    const ws = await this.git.workspaceSnapshot();
    if (!ws.available) {
      return {
        ok: false,
        missing: [],
        targetSlug: slug,
        targetHash,
        manifest: null,
        scopeConflict: {
          reason: 'git-unavailable',
          message: 'Git 状态不可用，无法进行发布预检',
          details: [],
        },
      };
    }

    // 1. 保留“不夹带代码”检查
    const codeDirty = ws.dirtyFiles.filter((f) =>
      f.startsWith('apps/') || f.startsWith('packages/') || f.startsWith('scripts/') ||
      ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'turbo.json', 'vercel.json'].includes(f)
    );
    if (codeDirty.length > 0) {
      return {
        ok: false,
        missing: [],
        targetSlug: slug,
        targetHash,
        manifest: null,
        scopeConflict: {
          reason: 'code-dirty',
          message: `检测到 ${codeDirty.length} 个代码文件处于未提交状态，为防止夹带代码，禁止发布`,
          details: codeDirty,
        },
      };
    }

    // 2. 检查 support-config 脏状态
    const supportConfigDirty = ws.dirtyFiles.filter((f) => f === 'content/support-config.json');
    if (supportConfigDirty.length > 0) {
      return {
        ok: false,
        missing: [],
        targetSlug: slug,
        targetHash,
        manifest: null,
        scopeConflict: {
          reason: 'support-config-dirty',
          message: '检测到 content/support-config.json 处于未提交状态，单篇发布范围冲突',
          details: supportConfigDirty,
        },
      };
    }

    // 3. 检查其他文章脏状态（A 发布时 B 也脏返回 scope-conflict）
    const otherContentDirty = ws.dirtyFiles.filter((f) => {
      if (!f.startsWith('content/log/')) return false;
      const baseName = path.basename(f);
      const fileSlug = baseName.replace(/\.(md|mdx)$/i, '');
      return fileSlug !== slug;
    });
    if (otherContentDirty.length > 0) {
      return {
        ok: false,
        missing: [],
        targetSlug: slug,
        targetHash,
        manifest: null,
        scopeConflict: {
          reason: 'other-content-dirty',
          message: `检测到其他文章存在未提交修改（${otherContentDirty.join(', ')}），单篇发布范围冲突`,
          details: otherContentDirty,
        },
      };
    }

    // 4. 生成稳定清单 manifest
    const targetPath = `content/log/${slug}${doc?.ext || '.md'}`;
    const items: ReleaseManifestItem[] = [
      {
        path: targetPath,
        slug,
        hash: targetHash,
        kind: 'content',
        status: 'modified',
      },
    ];
    const manifestPayload = JSON.stringify({
      targetSlug: slug,
      targetHash,
      headCommit: ws.headCommit,
      items,
    });
    const manifestHash = createHash('sha256').update(manifestPayload, 'utf8').digest('hex');
    const manifest: ReleaseManifest = {
      targetSlug: slug,
      targetHash,
      headCommit: ws.headCommit,
      manifestHash,
      items,
      createdAt: new Date().toISOString(),
    };

    return {
      ok: true,
      missing: [],
      targetSlug: slug,
      targetHash,
      publicHash,
      manifest,
      scopeConflict: null,
    };
  }

  /** 触发上线：返回 { runId, status }；已有运行在途时如实返回「进行中」 */
  async release(input: { slug: string; releaseId: string }): Promise<ReleaseResult> {
    const slug = input.slug.trim();
    const releaseId = input.releaseId.trim();
    if (!slug || !releaseId) throw validationError('slug-and-releaseId-required');
    if (!this.releasesRepo || !this.changesRepo || !this.files || !this.journal || !this.contentLock) {
      throw validationError('content-release-dependencies-unavailable');
    }

    const inFlight = this.running;
    if (inFlight) {
      if (inFlight.releaseId === releaseId) return { runId: inFlight.runId, status: 'RUNNING' };
      throw new ApiError('content-locked', HttpStatus.CONFLICT, '另一发布正在运行');
    }

    // 预检在派发之前：范围冲突或缺字段直接拒，绝不启动进程（也就不会有任何写动作）
    const preflight = await this.preflight(slug);
    if (!preflight.ok) {
      if (preflight.scopeConflict) {
        throw new ApiError('scope-conflict', HttpStatus.CONFLICT, `发布范围冲突：${preflight.scopeConflict.message}`);
      }
      throw validationError(`release-blocked:${preflight.missing.join(',')}`);
    }

    // 原子 check-and-set：预检期间可能已有运行启动，此处到赋值之间无 await
    if (this.running) {
      if (this.running.releaseId === releaseId) return { runId: this.running.runId, status: 'RUNNING' };
      throw new ApiError('content-locked', HttpStatus.CONFLICT, '另一发布正在运行');
    }
    const runId = `run_${Date.now()}_${randomBytes(4).toString('hex')}`;

    // 获取全工作区发布锁（C13）
    const lock = this.contentLock
      ? await this.contentLock.tryAcquire({
          owner: `api:${runId}`,
          targetSlug: slug,
          manifestHash: preflight.manifest?.manifestHash,
        })
      : null;
    if (this.contentLock && !lock) {
      throw new ApiError('content-locked', HttpStatus.CONFLICT, '工作区发布锁已被占用，正在发布中');
    }

    try {
      const currentDoc = await this.files.get(slug);
      if (!currentDoc || currentDoc.hash !== preflight.targetHash || !preflight.publicHash) {
        throw new ApiError('content-release-conflict', HttpStatus.CONFLICT, '正本版本已改变');
      }
      await this.journal.transaction(async (tx) => {
        const release = await tx.releases.findById(releaseId);
        if (!release || release.stage !== 'PREPARED' || release.target.slug !== slug ||
            release.sourceHash !== preflight.publicHash ||
            release.publishApproval.binding.candidateHash !== preflight.publicHash) {
          throw new ApiError('content-release-conflict', HttpStatus.CONFLICT, '发布单与当前批准版本不匹配');
        }
        const change = await this.changesRepo!.findById(release.changeId);
        if (!change || change.target.slug !== slug || change.state !== 'APPLIED' || change.appliedHash !== currentDoc.hash) {
          throw new ApiError('content-release-conflict', HttpStatus.CONFLICT, '已批准文件版本与当前正本不匹配');
        }
        const published = await tx.releases.findLatestPublishedForTarget(slug);
        if (published && release.baseHash !== published.verifiedHash) {
          throw new ApiError('content-release-conflict', HttpStatus.CONFLICT, '线上基线已改变，需重新批准');
        }
        const binding = release.publishApproval.binding;
        if (binding.grantId === 'grant-publish-owner') {
          if (!['owner', 'workstation'].includes(release.publishApproval.approvedBy)) {
            throw new ApiError('content-approval-invalid', HttpStatus.CONFLICT, '站主批准身份无效');
          }
        } else {
          const grant = await tx.grants.find(binding.grantId);
          if (!grant || grant.revision !== binding.grantRevision || !grant.agentId || !grantAllows(grant, {
            origin: 'admin', principalType: 'owner', principalId: 'owner', agentId: grant.agentId,
            action: 'content:publish', resourceKind: 'content', resourceId: slug, now: Date.now(),
          })) {
            throw new ApiError('grant-denied', 403, '发布授权已失效或不包含当前文章');
          }
        }
        await tx.releases.updateStage({ id: releaseId, stage: 'COMMITTING' });
        await tx.appendAudit({
          id: `release-dispatch-${releaseId}`, actor: 'owner', action: 'content.release.dispatch',
          targetType: 'content-release', targetId: releaseId, outcome: 'started',
          beforeHash: release.baseHash, afterHash: release.sourceHash,
        });
      });
    } catch (err: unknown) {
      if (lock && this.contentLock) await this.contentLock.release(lock.payload.lockId);
      throw err;
    }

    const abortController = new AbortController();
    this.running = { runId, releaseId, slug, abortController };

    void this.execute(runId, slug, preflight, lock, releaseId, abortController).catch((error: unknown) => {
      this.log.error(`发布运行异常结束：${error instanceof Error ? error.message : String(error)}`);
    });
    return { runId, status: 'RUNNING' };
  }

  /**
   * 线上版本核验（PRD A10 / C16）：只有线上确认到**目标 hash** 才完成网页阶段。
   * 旧网页、同标题旧正文、失败部署、缺少 hash 证据一律保持 VERIFYING 等待复检，绝不提前记为已发布。
   */
  async verify(releaseId: string): Promise<ReleaseVerificationResult> {
    if (!this.releasesRepo) throw validationError('content-release-repository-unavailable');
    if (!this.websiteVerifier) throw validationError('website-verifier-unavailable');

    const release = await this.releasesRepo.findById(releaseId);
    if (!release) {
      throw new ApiError('content-release-not-found', HttpStatus.NOT_FOUND, '找不到发布记录');
    }

    // 已确证发布：幂等返回，不再请求线上
    if (release.stage === 'PUBLISHED') {
      return {
        releaseId: release.id,
        stage: release.stage,
        assistantIndexState: release.assistantIndexState,
        publishedSnapshotId: release.publishedSnapshotId,
        verified: true,
        verifiedHash: release.verifiedHash,
        reason: release.assistantIndexState === 'FAILED' ? 'assistant-index-sync-failed' : null,
      };
    }

    if (release.stage !== 'VERIFYING') {
      throw new ApiError(
        'content-release-not-verifying',
        HttpStatus.CONFLICT,
        `只有待核验的发布才能核验，当前状态：${release.stage}`,
      );
    }

    const base = (process.env.PUBLIC_SITE_URL?.trim() || 'https://www.iwalk.pro').replace(/\/$/, '');
    const url = `${base}/posts/${encodeURIComponent(release.target.slug)}`;
    const verification = await this.websiteVerifier.verify(url, {
      slug: release.target.slug,
      expectedHash: release.sourceHash,
    });

    // 网页可达 ≠ 已发布：必须由线上 hash 证据确证目标版本
    const confirmed = verification.ok === true && verification.verifiedHash === release.sourceHash;
    if (!confirmed) {
      return {
        releaseId: release.id,
        stage: release.stage,
        assistantIndexState: release.assistantIndexState,
        publishedSnapshotId: release.publishedSnapshotId,
        verified: false,
        verifiedHash: verification.verifiedHash ?? null,
        reason: verification.reason ?? 'online-hash-not-confirmed',
      };
    }

    const updated = await this.releasesRepo.updateStage({
      id: release.id,
      stage: 'PUBLISHED',
      verifiedHash: release.sourceHash,
      verifiedAt: new Date().toISOString(),
    });

    // 问答快照切换（C17）：上线核验后导入该次构建快照并切指针，网页成功与问答索引成功分别记录
    let finalRelease = updated;
    if (this.publicSnapshots) {
      try {
        await this.releasesRepo.updateIndexState({
          id: release.id,
          assistantIndexState: 'SYNCING',
        });

        const manifestUrl = `${base}/public-manifest.json?_t=${Date.now()}`;
        const manifestRes = await fetch(manifestUrl, {
          headers: {
            accept: 'application/json',
            'cache-control': 'no-cache, no-store, must-revalidate',
            pragma: 'no-cache',
          },
          signal: AbortSignal.timeout(10_000),
        });

        if (!manifestRes.ok) {
          throw new Error(`manifest-http-${manifestRes.status}`);
        }

        const rawManifest = (await manifestRes.json()) as unknown;
        const sha = (text: string) => createHash('sha256').update(text).digest('hex');
        if (!verifyPublicSnapshot(rawManifest, sha)) {
          throw new Error('manifest-hash-invalid');
        }

        const manifest = rawManifest as VerifiedPublicSnapshot;
        const targetEntry = manifest.items?.find((item) => item.slug === release.target.slug);
        if (!targetEntry || targetEntry.hash !== release.sourceHash) {
          throw new Error('manifest-missing-target-version');
        }

        await this.publicSnapshots.publish(manifest);

        finalRelease = await this.releasesRepo.updateIndexState({
          id: release.id,
          assistantIndexState: 'SYNCED',
          publishedSnapshotId: manifest.collectionHash,
        });
      } catch (err: unknown) {
        this.log.error(
          `问答快照同步失败 releaseId=${release.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        finalRelease = await this.releasesRepo.updateIndexState({
          id: release.id,
          assistantIndexState: 'FAILED',
        });
      }
    }

    return {
      releaseId: finalRelease.id,
      stage: finalRelease.stage,
      assistantIndexState: finalRelease.assistantIndexState,
      publishedSnapshotId: finalRelease.publishedSnapshotId,
      verified: true,
      verifiedHash: finalRelease.verifiedHash,
      reason: finalRelease.assistantIndexState === 'FAILED' ? 'assistant-index-sync-failed' : null,
    };
  }

  /**
   * 内容版本快照（TECH-DESIGN §5.2）：
   * 分别从文件正本、已发布发布记录、已激活问答快照三个独立真相源推导，不相互覆盖。
   */
  async getVersionSnapshot(slug: string): Promise<ContentVersionSnapshot> {
    const doc = this.files ? await this.files.get(slug) : null;
    const workingHash = doc?.hash ?? null;

    let publishedHash: string | null = null;
    if (this.releasesRepo) {
      const latest = await this.releasesRepo.findLatestPublishedForTarget(slug);
      if (latest && latest.stage === 'PUBLISHED') {
        publishedHash = latest.verifiedHash;
      }
    }

    let indexedHash: string | null = null;
    if (this.publicSnapshots) {
      try {
        const active = await this.publicSnapshots.readActive();
        const entry = active.items?.find((item) => item.slug === slug);
        if (entry) {
          indexedHash = entry.hash;
        }
      } catch {
        indexedHash = null;
      }
    }

    return {
      workingHash,
      publishedHash,
      indexedHash,
    };
  }

  /**
   * 独立发布批准与发布准备（PRD A8/A9、TECH-DESIGN §6.2/C20）：
   * 必须校验 preflight 门禁与发布范围，构造 ContentApproval<'publish-website'>，
   * 绑定 L2 授权与对象版本，创建 PREPARED 状态的 ContentRelease 事实记录。
   */
  async prepareRelease(input: {
    slug: string;
    grantId?: string;
    actor?: string;
    changeId?: string;
    requestKey?: string;
  }): Promise<ContentRelease> {
    if (!this.releasesRepo) throw validationError('content-release-repository-unavailable');
    const slug = input.slug.trim();
    if (!slug) throw validationError('slug-required');

    const entry = await this.entries.get(slug);
    if (!entry) {
      throw new ApiError('content-not-found', HttpStatus.NOT_FOUND, '内容不存在');
    }

    const preflight = await this.preflight(slug);
    if (!preflight.ok) {
      if (preflight.scopeConflict) {
        throw new ApiError('scope-conflict', HttpStatus.CONFLICT, `发布范围冲突：${preflight.scopeConflict.message}`);
      }
      throw validationError(`release-blocked:${preflight.missing.join(',')}`);
    }

    const doc = this.files ? await this.files.get(slug) : null;
    const targetHash = doc?.hash ?? preflight.targetHash;
    if (!targetHash) {
      throw validationError('target-hash-missing');
    }

    let publishGrantRevision = 1;
    if (input.grantId) {
      const grant = await this.grants?.find(input.grantId);
      if (!grant || !grant.agentId || !grantAllows(grant, {
        origin: 'admin', principalType: 'owner', principalId: input.actor || 'owner',
        agentId: grant.agentId, action: 'content:publish',
        resourceKind: 'content', resourceId: slug, now: Date.now(),
      })) {
        throw new ApiError('grant-denied', 403, '发布授权不存在、已失效或不包含当前文章');
      }
      publishGrantRevision = grant.revision;
    }

    const requestKey = input.requestKey?.trim() || `rel_req_${slug}_${targetHash.slice(0, 16)}_${Date.now()}`;
    const existing = await this.releasesRepo.findByRequestKey(requestKey);
    if (existing) return existing;

    const versionSnapshot = await this.getVersionSnapshot(slug);

    /**
     * 两个命名空间必须分开（否则线上核验永远对不上，C16/C17 与 C12/C14 的接缝）：
     * - sourceHash / baseHash：公开版本身份。线上文章 content-hash 与 public-manifest.json
     *   条目 hash 都由公开投影（projectPublicItems → stableJson）哈希而来，审批 binding 用它。
     *   文件版本本身由 changeId 追溯（change.appliedHash），不在 release 上重复存。
     */
    const sourceHash = preflight.publicHash;
    if (!sourceHash) throw validationError('public-hash-missing');

    // baseHash = 被这次发布替换掉的当前线上公开版本；从未发布过时保留为「无前版本」的空串。
    let baseHash = versionSnapshot.publishedHash ?? '';

    /**
     * 绑定「已批准且已落盘的文件版本」：优先复用已有的 APPLIED 候选（appliedHash 必须等于当前文件 hash），
     * 否则为站主人工编辑建立一条并列的受控记录（人工保存按 C05 语义不产生候选）。
     * 无论哪条路径，release 指向的文件版本都由 changeId → change.appliedHash 可追溯。
     */
    let change: ContentChange | null = null;
    if (input.changeId && this.changesRepo) {
      change = await this.changesRepo.findById(input.changeId);
      if (!change) throw new ApiError('content-change-not-found', HttpStatus.NOT_FOUND, '找不到内容候选');
      if (change.state !== 'APPLIED' || change.appliedHash !== targetHash) {
        throw new ApiError('content-release-conflict', HttpStatus.CONFLICT, '指定的候选尚未应用或与当前文件版本不一致');
      }
    } else if (this.changesRepo) {
      const allChanges = await this.changesRepo.list({ slug });
      change = allChanges.find((c: ContentChange) => c.state === 'APPLIED' && c.appliedHash === targetHash) ?? null;
      if (!change) {
        const manualId = `chg_man_${randomUUID().slice(0, 12)}`;
        const manualBase = versionSnapshot.publishedHash ?? createHash('sha256').update(`${targetHash}:prev`).digest('hex');
        change = await this.changesRepo.createOnce({
          id: manualId,
          target: { kind: 'content', slug },
          baseHash: manualBase,
          candidateHash: targetHash,
          candidateRef: `manual_${slug}`.slice(0, 100),
          sourceRunId: null,
          requestKey: `man_chg_${slug}_${targetHash.slice(0, 16)}_${Date.now()}`,
        });
        const applyBinding = {
          action: 'apply-candidate' as const,
          target: { kind: 'content' as const, slug },
          baseHash: manualBase,
          candidateHash: targetHash,
          grantId: input.grantId || 'grant-manual-owner',
          grantRevision: 1,
        };
        await this.changesRepo.recordApproval({
          id: change.id,
          approval: {
            id: randomUUID(),
            binding: applyBinding,
            bindingHash: createHash('sha256').update(contentApprovalBindingKey(applyBinding)).digest('hex'),
            approvedBy: input.actor || 'owner',
            approvedAt: new Date().toISOString(),
          },
        });
        const manualRequestId = `req_${randomUUID().slice(0, 8)}`;
        await this.changesRepo.beginApply({ id: change.id, actor: input.actor || 'owner', requestId: manualRequestId });
        await this.changesRepo.finishApply({
          id: change.id,
          actor: input.actor || 'owner',
          requestId: manualRequestId,
          outcome: 'APPLIED',
          observedHash: targetHash,
        });
      }
    } else {
      throw validationError('content-change-repository-unavailable');
    }

    const publishBinding = {
      action: 'publish-website' as const,
      target: { kind: 'content' as const, slug },
      baseHash: baseHash || change.baseHash,
      candidateHash: sourceHash,
      grantId: input.grantId || 'grant-publish-owner',
      grantRevision: publishGrantRevision,
    };
    baseHash = publishBinding.baseHash;

    const publishApproval: ContentApproval<'publish-website'> = {
      id: randomUUID(),
      binding: publishBinding,
      bindingHash: createHash('sha256').update(contentApprovalBindingKey(publishBinding)).digest('hex'),
      approvedBy: input.actor || 'owner',
      approvedAt: new Date().toISOString(),
    };

    const releaseId = `rel_${randomUUID().slice(0, 12)}`;
    return await this.releasesRepo.createOnce({
      id: releaseId,
      changeId: change.id,
      target: { kind: 'content', slug },
      baseHash,
      sourceHash,
      publishApproval,
      requestKey,
    });
  }

  async getLatestRelease(slug: string): Promise<ContentRelease | null> {
    if (!this.releasesRepo) return null;
    return await this.releasesRepo.findLatestForTarget(slug);
  }

  async getRelease(id: string): Promise<ContentRelease | null> {
    if (!this.releasesRepo) throw validationError('content-release-repository-unavailable');
    const release = await this.releasesRepo.findById(id);
    if (!release) {
      throw new ApiError('content-release-not-found', HttpStatus.NOT_FOUND, '找不到发布记录');
    }
    return release;
  }

  /**
   * 结果不明的发布核对（PRD A3 / TECH-DESIGN §5.2 / C18）：
   * 对 push 响应丢失、服务重启、Vercel 长时间未生效，根据 commit / 线上 hash 继续核验，
   * 严防自动重复提交，未知状态转为事实状态；无法核验时保留 UNKNOWN 与下一检查动作。
   */
  async reconcile(releaseId: string): Promise<ReleaseReconcileResult> {
    if (!this.releasesRepo) throw validationError('content-release-repository-unavailable');

    const release = await this.releasesRepo.findById(releaseId);
    if (!release) {
      throw new ApiError('content-release-not-found', HttpStatus.NOT_FOUND, '找不到发布记录');
    }

    const previousStage = release.stage;

    if (release.stage === 'COMMITTING' &&
        (this.running?.releaseId === releaseId || await this.contentLock?.isLocked())) {
      return {
        releaseId: release.id, previousStage, currentStage: 'COMMITTING', resolved: false,
        nextAction: 'wait-run', details: '发布进程或工作区锁仍在运行，等待退出证明后再核对',
        verifiedHash: null, gitCommit: release.gitCommit,
      };
    }

    // 1. 已确证终态无需重复核对
    if (release.stage === 'PUBLISHED') {
      return {
        releaseId: release.id,
        previousStage,
        currentStage: release.stage,
        resolved: true,
        nextAction: 'none',
        details: '发布已由线上证据确证为已发布，无需核对',
        verifiedHash: release.verifiedHash,
        gitCommit: release.gitCommit,
      };
    }

    if (release.stage === 'FAILED') {
      return {
        releaseId: release.id,
        previousStage,
        currentStage: release.stage,
        resolved: true,
        nextAction: 'none',
        details: `发布此前已失败（${release.errorCode ?? 'unknown-error'}），未发生有效推送`,
        verifiedHash: null,
        gitCommit: release.gitCommit,
      };
    }

    const base = (process.env.PUBLIC_SITE_URL?.trim() || 'https://www.iwalk.pro').replace(/\/$/, '');
    const url = `${base}/posts/${encodeURIComponent(release.target.slug)}`;

    // 2. 线上事实核验优先：若线上已是目标 hash，直接转为 PUBLISHED 并切换问答快照
    if (this.websiteVerifier) {
      try {
        const verification = await this.websiteVerifier.verify(url, {
          slug: release.target.slug,
          expectedHash: release.sourceHash,
          retries: 0,
        });

        if (verification.ok === true && verification.verifiedHash === release.sourceHash) {
          if (release.stage !== 'VERIFYING') {
            await this.releasesRepo.updateStage({ id: release.id, stage: 'VERIFYING' });
          }
          const verified = await this.verify(release.id);
          return {
            releaseId: release.id,
            previousStage,
            currentStage: verified.stage,
            resolved: true,
            nextAction: 'none',
            details: '线上文章与版本证明已确证，发布成功且问答索引已同步',
            verifiedHash: verified.verifiedHash,
            gitCommit: release.gitCommit,
          };
        }
      } catch (err: unknown) {
        this.log.warn(`线上核验探针失败（将回落至 Git 事实判定）：${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 3. 只有脚本成功退出后记录的 PUSHED 才证明 push 完成；本地 commit 不能证明远端接收。
    const hasRecordedCommit = Boolean(release.gitCommit);
    let commitExistsInRepo = false;
    if (release.gitCommit && this.git?.hasCommit) {
      commitExistsInRepo = await this.git.hasCommit(release.gitCommit);
    }

    if (release.stage === 'PUSHED' || release.stage === 'VERIFYING') {
      let currentStage: ContentReleaseStage = release.stage;
      if (currentStage !== 'VERIFYING') {
        const updated = await this.releasesRepo.updateStage({ id: release.id, stage: 'VERIFYING' });
        currentStage = updated.stage;
      }
      return {
        releaseId: release.id,
        previousStage,
        currentStage,
        resolved: false,
        nextAction: 'wait-deployment',
        details: '已确证 Git 提交存在，内容已推送或准备推送，正等待 Vercel 部署生效，严禁重复提交',
        verifiedHash: null,
        gitCommit: release.gitCommit,
      };
    }

    if (hasRecordedCommit || commitExistsInRepo) {
      if (release.stage !== 'UNKNOWN') {
        await this.releasesRepo.updateStage({ id: release.id, stage: 'UNKNOWN' });
      }
      return {
        releaseId: release.id, previousStage, currentStage: 'UNKNOWN', resolved: false,
        nextAction: 'check-git-remote',
        details: '仅确证本地提交存在，尚无远端推送证据；保持结果不明且不自动重复提交',
        verifiedHash: null, gitCommit: release.gitCommit,
      };
    }

    // 4. 未产生提交的异常中断（如 COMMITTING 阶段崩溃）
    if (release.stage === 'COMMITTING') {
      const ws = await this.git?.workspaceSnapshot?.();
      const isDirty = ws?.dirtyFiles.some((f) => f.includes(release.target.slug));
      if (isDirty) {
        const updated = await this.releasesRepo.updateStage({
          id: release.id,
          stage: 'FAILED',
          errorCode: 'commit-interrupted',
        });
        return {
          releaseId: release.id,
          previousStage,
          currentStage: updated.stage,
          resolved: true,
          nextAction: 'none',
          details: '工作区文件未提交，原发布提交动作已中断并安全置为失败，可重新发起发布',
          verifiedHash: null,
          gitCommit: null,
        };
      }
    }

    // 5. 无法确证时：保留或转入 UNKNOWN，并给出明确的下一步检查指引
    let currentStage: ContentReleaseStage = release.stage;
    if (currentStage !== 'UNKNOWN') {
      const updated = await this.releasesRepo.updateStage({ id: release.id, stage: 'UNKNOWN' });
      currentStage = updated.stage;
    }

    return {
      releaseId: release.id,
      previousStage,
      currentStage,
      resolved: false,
      nextAction: 'check-git-remote',
      details: '无法确认 Git 推送与线上生效状态，保持 UNKNOWN 状态，请人工核查远端 Git 仓库与网络',
      verifiedHash: null,
      gitCommit: release.gitCommit,
    };
  }

  /**
   * 取消发布并进行进程树终止核验（PRD A13 / TECH-DESIGN §10.3 / C19）：
   * 终止构建时确认子进程退出，不留下活跃构建占资源；
   * 若 push 已派发，只能请求停止后核对实际效果，绝不能将可能已上线的操作标为“取消且未发布”。
   */
  async cancel(releaseId: string): Promise<ReleaseCancelResult> {
    if (!this.releasesRepo) throw validationError('content-release-repository-unavailable');

    const release = await this.releasesRepo.findById(releaseId);
    if (!release) {
      throw new ApiError('content-release-not-found', HttpStatus.NOT_FOUND, '找不到发布记录');
    }

    // 1. 已是终态，无法取消
    if (release.stage === 'PUBLISHED') {
      return {
        releaseId: release.id,
        cancelled: false,
        stage: release.stage,
        message: '发布已由线上确证为已发布，无法取消',
      };
    }

    if (release.stage === 'FAILED') {
      return {
        releaseId: release.id,
        cancelled: false,
        stage: release.stage,
        message: '发布已处于失败终态，无需取消',
      };
    }

    // PREPARED 尚未启动脚本，可以确证没有提交或推送。
    if (release.stage === 'PREPARED') {
      const updated = await this.releasesRepo.updateStage({
        id: release.id, stage: 'FAILED', errorCode: 'cancelled-before-dispatch',
      });
      return { releaseId: release.id, cancelled: true, stage: updated.stage, message: '发布尚未派发，已取消' };
    }

    // COMMITTING 包含 git push：即使进程退出，也不能凭取消请求断言远端没有接收提交。
    if (release.stage === 'COMMITTING') {
      if (this.running?.releaseId === release.id) {
        this.running.abortController?.abort();
        if (this.running.pid && this.runner.terminateProcessTree) {
          await this.runner.terminateProcessTree(this.running.pid);
        }
      }
      const updated = await this.releasesRepo.updateStage({ id: release.id, stage: 'UNKNOWN', errorCode: 'cancel-outcome-unknown' })
        .catch(async () => (await this.releasesRepo!.findById(release.id))!);
      return {
        releaseId: release.id,
        cancelled: false,
        stage: updated.stage,
        message: '已请求停止；推送结果仍需核对，不能据此断言未发布',
      };
    }

    // 3. 核心红线：若已推进到 PUSHED / VERIFYING / UNKNOWN：
    // push 已派发只能请求停止后核对实际效果，不能将可能已上线的操作标为“取消且未发布”！
    if (this.running?.releaseId === release.id) {
      this.running.abortController?.abort();
      if (this.running.pid && this.runner.terminateProcessTree) {
        await this.runner.terminateProcessTree(this.running.pid);
      }
    }

    const reconciled = await this.reconcile(release.id);

    if (reconciled.currentStage === 'PUBLISHED') {
      return {
        releaseId: release.id,
        cancelled: false,
        stage: reconciled.currentStage,
        message: '发布已派发并在生产环境生效，无法取消，已确证为已发布',
      };
    }

    return {
      releaseId: release.id,
      cancelled: false,
      stage: reconciled.currentStage,
      message: `发布已推送到远端，无法直接取消；当前状态：${reconciled.currentStage}，需等待部署核对结果`,
    };
  }

  /** 执行发布并落轨迹；任何路径都留痕，绝不写成功（TECH-DESIGN §5.4） */
  private async execute(
    runId: string,
    slug: string,
    initialPreflight?: ReleasePreflightResult,
    lock?: ContentLockRecord | null,
    releaseId?: string,
    abortController?: AbortController,
  ): Promise<void> {
    const startedAt = Date.now();
    let runnerStarted = false;
    let processExitUnproven = false;
    try {
      // 构建/提交前复检允许路径和目标 hash，预检后额外变化使批准失效（C13）
      if (initialPreflight?.manifest) {
        const recheck = await this.preflight(slug);
        if (
          !recheck.ok ||
          recheck.scopeConflict ||
          recheck.manifest?.manifestHash !== initialPreflight.manifest.manifestHash ||
          recheck.manifest?.targetHash !== initialPreflight.manifest.targetHash
        ) {
          if (releaseId && this.releasesRepo) {
            await this.releasesRepo.updateStage({
              id: releaseId, stage: 'FAILED', errorCode: 'preflight-changed-before-dispatch',
            }).catch(() => {});
          }
          await this.trace.append(runId, {
            type: 'run.error',
            source: 'publish',
            payload: {
              code: 'scope-conflict',
              message: '构建提交前复检发现工作区发生额外变动，原发布批准与清单已失效',
              elapsedMs: Math.max(1, Date.now() - startedAt),
            },
          });
          return;
        }
      }

      await this.trace.append(runId, {
        type: 'run.start',
        source: 'publish',
        payload: { kind: 'publish', target: slug },
      });
      const stageStartedAt = Date.now();
      await this.trace.append(runId, {
        type: 'stage.start',
        source: 'publish',
        payload: { stage: 'tool', label: 'content:publish --push' },
      });

      runnerStarted = true;
      const result = await this.runner.runRelease({
        signal: abortController?.signal,
        ...(lock ? { lock: { lockFile: lock.lockFile, lockId: lock.payload.lockId } } : {}),
        onSpawn: (pid) => {
          if (this.running?.runId === runId) {
            this.running.pid = pid;
          }
        },
      });
      processExitUnproven = result.exitProof !== 'exited';
      const tail = this.outputTail(result);

      await this.trace.append(runId, {
        type: 'stage.end',
        source: 'publish',
        payload: {
          stage: 'tool',
          elapsedMs: Math.max(1, Date.now() - stageStartedAt),
          data: { exitCode: result.exitCode, timedOut: result.timedOut },
        },
      });

      if (result.timedOut || result.exitCode !== 0 || processExitUnproven) {
        const errorCode = 'release-outcome-unknown';
        if (releaseId && this.releasesRepo) {
          await this.releasesRepo.updateStage({
            id: releaseId,
            stage: 'UNKNOWN',
            errorCode,
          }).catch(() => {});
        }

        await this.trace.append(runId, {
          type: 'run.error',
          source: 'publish',
          payload: {
            status: 'UNKNOWN',
            code: errorCode,
            ...(result.exitCode !== null ? { exitCode: result.exitCode } : {}),
            message: fitMessage(tail.join('\n')),
          },
        });
        return;
      }

      // 读取真实的 HEAD commit
      const head = await this.git?.snapshot();
      const gitCommit = head?.headCommit ?? null;

      // 阶段推进：COMMITTING -> PUSHED -> VERIFYING（退出码 0 绝不标记为 PUBLISHED，C14 核心红线）
      if (releaseId && this.releasesRepo) {
        await this.releasesRepo.updateStage({
          id: releaseId,
          stage: 'PUSHED',
          gitCommit,
          manifestHash: initialPreflight?.manifest?.manifestHash,
        });
        await this.releasesRepo.updateStage({
          id: releaseId,
          stage: 'VERIFYING',
        });
      }

      await this.trace.append(runId, {
        type: 'run.end',
        source: 'publish',
        payload: {
          status: 'SUCCESS',
          stage: 'VERIFYING',
          gitCommit,
          elapsedMs: Date.now() - startedAt,
          metrics: { exitCode: 0 },
        },
      });
    } catch (error) {
      if (releaseId && this.releasesRepo) {
        const current = await this.releasesRepo.findById(releaseId).catch(() => null);
        if (current?.stage === 'COMMITTING') {
          await this.releasesRepo.updateStage({
            id: releaseId,
            stage: runnerStarted ? 'UNKNOWN' : 'FAILED',
            errorCode: runnerStarted ? 'release-outcome-unknown' : 'release-dispatch-failed',
          }).catch(() => {});
        }
      }
      // 派发失败也是失败事实：如实留痕，不写成功。
      // 绝对路径与 outputTail 同口径脱敏（TECH-DESIGN §4.1/§8 #5：绝对路径不进轨迹）。
      await this.safeAppend(runId, {
        type: 'run.error',
        source: 'publish',
        payload: {
          status: runnerStarted ? 'UNKNOWN' : 'FAILED',
          code: runnerStarted ? 'release-outcome-unknown' : 'release-dispatch-failed',
          message: fitMessage(
            redactAbsolutePaths(error instanceof Error ? error.message : String(error)),
          ),
        },
      });
    } finally {
      if (this.running?.runId === runId) this.running = null;
      if (lock && this.contentLock && !processExitUnproven) {
        await this.contentLock.release(lock.payload.lockId).catch(() => {});
      }
    }
  }

  /**
   * 输出尾部：优先用脚本 `--json` 回报里的 tail（人读日志在该模式下只进 JSON），
   * 解析不到（如被超时强杀）则退回原始 stdout/stderr；统一脱敏绝对路径并按字节裁剪。
   */
  private outputTail(result: ReleaseProcessResult): string[] {
    const report = parseJsonReport(result.stdout);
    const source = report ? report.tail.join('\n') : `${result.stdout}\n${result.stderr}`;
    return source
      .split('\n')
      .map((line) => redactAbsolutePaths(line.trim()))
      .filter((line) => line.length > 0)
      .slice(-RELEASE_TAIL_LINES);
  }

  /** 轨迹写入尽力而为：写不进去也不能把失败包装成成功，只记日志 */
  private async safeAppend(runId: string, event: TraceAppendInput): Promise<void> {
    try {
      await this.trace.append(runId, event);
    } catch (error) {
      this.log.error(
        `轨迹写入失败 runId=${runId}：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
