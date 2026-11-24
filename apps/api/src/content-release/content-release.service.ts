/**
 * 内容上线用例层门面（PRD A7–A11、TECH-DESIGN §5.2/§6.2/D2）
 * 只读预检、批准准备、线上核验、核对取消分别由同目录协作者模块承担；
 * 本类专注持有并发运行锁 (`running`)、自动核验定时器生命周期 (`autoVerifyTimers`) 与异步调度执行。
 */
import { HttpStatus, Inject, Injectable, Logger, Optional, type OnModuleDestroy } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  ContentRelease,
  ContentVersionSnapshot,
  ReleaseCancelResult,
  ReleaseManifest,
  ReleaseManifestItem,
  ReleasePreflightResult,
  ReleaseReconcileNextAction,
  ReleaseReconcileResult,
  ReleaseResult,
  ReleaseScopeConflict,
  ReleaseVerificationResult,
} from '@walker/shared';
import { ApiError, validationError } from '../common/http-error';
import { AUTHORIZATION_REPOSITORY, type AuthorizationRepositoryPort } from '../ports/authorization.repository';
import { ARTICLE_VERSION_STORE, type ArticleVersionStorePort } from '../ports/article-version-store.port';
import { CONTENT_CHANGE_REPOSITORY, type ContentChangeRepositoryPort } from '../ports/content-change.repository';
import { CONTENT_FILE_REPOSITORY, type ContentFileRepositoryPort } from '../ports/content-file.repository';
import { CONTENT_LEDGER_REPOSITORY, type ContentLedgerRepositoryPort } from '../ports/content-ledger.repository';
import { CONTENT_LOCK, type ContentLockPort, type ContentLockRecord } from '../ports/content-lock.port';
import { CONTENT_RELEASE_RUNNER, type ContentReleaseRunnerPort } from '../ports/content-release-runner.port';
import { CONTENT_RELEASE_REPOSITORY, type ContentReleaseRepositoryPort } from '../ports/content-release.repository';
import { GIT_STATUS, type GitStatusPort } from '../ports/git-status.repository';
import { OPERATIONS_JOURNAL, type OperationsJournalPort } from '../ports/operations-journal.port';
import { PUBLIC_SNAPSHOT_REPOSITORY, type PublicSnapshotRepositoryPort } from '../ports/public-snapshot.repository';
import { TRACE_WRITER, type TraceAppendInput, type TraceWriterPort } from '../ports/trace.repository';
import { WEBSITE_DEPLOYMENT_VERIFIER, type WebsiteDeploymentVerifierPort } from '../ports/website-deployment-verifier.port';
import { readContentVersionSnapshot, runReleasePreflight } from './release-preflight';
import { commitReleaseDispatch, prepareContentRelease, type PrepareReleaseInput } from './release-preparation';
import { cancelContentRelease, reconcileContentRelease, type RunningReleaseHandle } from './release-reconcile';
import { extractReleaseOutputTail, fitReleaseMessage, redactAbsolutePaths } from './release-trace';
import { verifyContentRelease } from './release-verification';

/** 推送后退避核验窗口（最多 6 轮共 ~4.5 分钟），耗尽仍未确证则持久化 errorCode 并落 FAILED */
const AUTO_VERIFY_RETRY_DELAYS_MS = [20_000, 30_000, 45_000, 60_000, 60_000, 60_000] as const;
const MAX_VERIFY_ERROR_CODE_LEN = 120;

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

@Injectable()
export class ContentReleaseService implements OnModuleDestroy {
  private readonly log = new Logger(ContentReleaseService.name);
  private readonly autoVerifyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** 进程内单实例锁：同一时刻只允许一个发布进程，记录当前运行归属与控制器（PRD A9 / C19） */
  private running: RunningReleaseHandle | null = null;

  onModuleDestroy(): void {
    for (const timer of this.autoVerifyTimers.values()) clearTimeout(timer);
    this.autoVerifyTimers.clear();
  }

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
    @Optional() @Inject(ARTICLE_VERSION_STORE)
    private readonly articleVersions?: ArticleVersionStorePort,
  ) {}

  preflight(slug: string): Promise<ReleasePreflightResult> {
    return runReleasePreflight(
      {
        entries: this.entries,
        files: this.files,
        git: this.git,
        releasesRepo: this.releasesRepo,
        publicSnapshots: this.publicSnapshots,
      },
      slug,
    );
  }

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

    const preflight = await this.preflight(slug);
    if (!preflight.ok) {
      if (preflight.scopeConflict) {
        throw new ApiError('scope-conflict', HttpStatus.CONFLICT, `发布范围冲突：${preflight.scopeConflict.message}`);
      }
      throw validationError(`release-blocked:${preflight.missing.join(',')}`);
    }

    if (this.running) {
      if (this.running.releaseId === releaseId) return { runId: this.running.runId, status: 'RUNNING' };
      throw new ApiError('content-locked', HttpStatus.CONFLICT, '另一发布正在运行');
    }
    const runId = `run_${Date.now()}_${randomBytes(4).toString('hex')}`;
    const lock = await this.contentLock.tryAcquire({
      owner: `api:${runId}`,
      targetSlug: slug,
      manifestHash: preflight.manifest?.manifestHash,
    });
    if (!lock) throw new ApiError('content-locked', HttpStatus.CONFLICT, '工作区发布锁已被占用，正在发布中');

    let targetContext: { ext: '.md' | '.mdx'; rawContent: string; versionNote: string };
    try {
      targetContext = await commitReleaseDispatch(
        { files: this.files, changesRepo: this.changesRepo, journal: this.journal },
        { slug, releaseId, preflight },
      );
    } catch (err: unknown) {
      await this.contentLock.release(lock.payload.lockId);
      throw err;
    }

    const abortController = new AbortController();
    this.running = { runId, releaseId, slug, abortController };
    void this.execute(runId, slug, preflight, lock, releaseId, abortController, targetContext).catch((error: unknown) => {
      this.log.error(`发布运行异常结束：${error instanceof Error ? error.message : String(error)}`);
    });
    return { runId, status: 'RUNNING' };
  }

  verify(releaseId: string): Promise<ReleaseVerificationResult> {
    return verifyContentRelease(
      {
        releasesRepo: this.releasesRepo,
        websiteVerifier: this.websiteVerifier,
        articleVersions: this.articleVersions,
        files: this.files,
        changesRepo: this.changesRepo,
        publicSnapshots: this.publicSnapshots,
        log: this.log,
      },
      releaseId,
    );
  }

  getVersionSnapshot(slug: string): Promise<ContentVersionSnapshot> {
    return readContentVersionSnapshot(
      {
        files: this.files,
        entries: this.entries,
        releasesRepo: this.releasesRepo,
        publicSnapshots: this.publicSnapshots,
      },
      slug,
    );
  }

  prepareRelease(input: PrepareReleaseInput): Promise<ContentRelease> {
    return prepareContentRelease(
      {
        entries: this.entries,
        files: this.files,
        git: this.git,
        releasesRepo: this.releasesRepo,
        publicSnapshots: this.publicSnapshots,
        changesRepo: this.changesRepo,
        grants: this.grants,
        journal: this.journal,
      },
      input,
    );
  }

  async getLatestRelease(slug: string): Promise<ContentRelease | null> {
    if (!this.releasesRepo) return null;
    return this.releasesRepo.findLatestForTarget(slug);
  }

  async getRelease(id: string): Promise<ContentRelease | null> {
    if (!this.releasesRepo) throw validationError('content-release-repository-unavailable');
    const release = await this.releasesRepo.findById(id);
    if (!release) throw new ApiError('content-release-not-found', HttpStatus.NOT_FOUND, '找不到发布记录');
    return release;
  }

  private reconcileDeps() {
    return {
      releasesRepo: this.releasesRepo,
      contentLock: this.contentLock,
      websiteVerifier: this.websiteVerifier,
      git: this.git,
      runner: this.runner,
      log: this.log,
      getRunning: () => this.running,
      verifyRelease: (id: string) => this.verify(id),
    };
  }

  reconcile(releaseId: string): Promise<ReleaseReconcileResult> {
    return reconcileContentRelease(this.reconcileDeps(), releaseId);
  }

  cancel(releaseId: string): Promise<ReleaseCancelResult> {
    return cancelContentRelease(this.reconcileDeps(), releaseId);
  }

  private async execute(
    runId: string,
    slug: string,
    initialPreflight?: ReleasePreflightResult,
    lock?: ContentLockRecord | null,
    releaseId?: string,
    abortController?: AbortController,
    targetContext?: { ext: '.md' | '.mdx'; rawContent: string; versionNote: string },
  ): Promise<void> {
    const startedAt = Date.now();
    let runnerStarted = false;
    let processExitUnproven = false;
    try {
      if (initialPreflight?.manifest) {
        const recheck = await this.preflight(slug);
        if (
          !recheck.ok ||
          recheck.scopeConflict ||
          recheck.manifest?.manifestHash !== initialPreflight.manifest.manifestHash ||
          recheck.manifest?.targetHash !== initialPreflight.manifest.targetHash
        ) {
          if (releaseId && this.releasesRepo) {
            await this.releasesRepo.updateStage({ id: releaseId, stage: 'FAILED', errorCode: 'preflight-changed-before-dispatch' }).catch(() => {});
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

      await this.trace.append(runId, { type: 'run.start', source: 'publish', payload: { kind: 'publish', target: slug } });
      const stageStartedAt = Date.now();
      await this.trace.append(runId, { type: 'stage.start', source: 'publish', payload: { stage: 'tool', label: 'content:publish --push' } });

      runnerStarted = true;
      const result = await this.runner.runRelease({
        signal: abortController?.signal,
        ...(lock ? { lock: { lockFile: lock.lockFile, lockId: lock.payload.lockId } } : {}),
        ...(targetContext && releaseId ? { target: { slug, ...targetContext, releaseId } } : {}),
        onSpawn: (pid) => { if (this.running?.runId === runId) this.running.pid = pid; },
      });
      processExitUnproven = result.exitProof !== 'exited';
      const tail = extractReleaseOutputTail(result);

      await this.trace.append(runId, {
        type: 'stage.end',
        source: 'publish',
        payload: { stage: 'tool', elapsedMs: Math.max(1, Date.now() - stageStartedAt), data: { exitCode: result.exitCode, timedOut: result.timedOut } },
      });

      if (result.conflict === true) {
        if (releaseId && this.releasesRepo) {
          await this.releasesRepo.updateStage({ id: releaseId, stage: 'FAILED', errorCode: 'remote-conflict' }).catch(() => {});
        }
        await this.trace.append(runId, {
          type: 'run.error',
          source: 'publish',
          payload: { status: 'FAILED', code: 'remote-conflict', message: fitReleaseMessage(tail.join('\n') || '远端已修改该文章，发布取消以避免覆盖') },
        });
        return;
      }

      if (result.timedOut || result.exitCode !== 0 || processExitUnproven) {
        if (releaseId && this.releasesRepo) {
          await this.releasesRepo.updateStage({ id: releaseId, stage: 'UNKNOWN', errorCode: 'release-outcome-unknown' }).catch(() => {});
        }
        await this.trace.append(runId, {
          type: 'run.error',
          source: 'publish',
          payload: { status: 'UNKNOWN', code: 'release-outcome-unknown', ...(result.exitCode !== null ? { exitCode: result.exitCode } : {}), message: fitReleaseMessage(tail.join('\n')) },
        });
        return;
      }

      const gitCommit = result.gitCommit ?? (await this.git?.snapshot())?.headCommit ?? null;
      if (releaseId && this.releasesRepo) {
        await this.releasesRepo.updateStage({ id: releaseId, stage: 'PUSHED', gitCommit, manifestHash: initialPreflight?.manifest?.manifestHash });
        await this.releasesRepo.updateStage({ id: releaseId, stage: 'VERIFYING' });
        this.scheduleAutoVerify(releaseId);
      }

      await this.trace.append(runId, {
        type: 'run.end',
        source: 'publish',
        payload: { status: 'SUCCESS', stage: 'VERIFYING', gitCommit, elapsedMs: Date.now() - startedAt, metrics: { exitCode: 0 } },
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
      await this.safeAppend(runId, {
        type: 'run.error',
        source: 'publish',
        payload: {
          status: runnerStarted ? 'UNKNOWN' : 'FAILED',
          code: runnerStarted ? 'release-outcome-unknown' : 'release-dispatch-failed',
          message: fitReleaseMessage(redactAbsolutePaths(error instanceof Error ? error.message : String(error))),
        },
      });
    } finally {
      if (this.running?.runId === runId) this.running = null;
      if (lock && this.contentLock && !processExitUnproven) {
        await this.contentLock.release(lock.payload.lockId).catch(() => {});
      }
    }
  }

  private async markAutoVerifyFailed(releaseId: string, reason: string): Promise<void> {
    if (!this.releasesRepo) return;
    try {
      const current = await this.releasesRepo.findById(releaseId);
      if (current?.stage === 'VERIFYING') {
        await this.releasesRepo.updateStage({
          id: releaseId,
          stage: 'FAILED',
          errorCode: reason.slice(0, MAX_VERIFY_ERROR_CODE_LEN) || 'verify-timeout',
        });
      }
    } catch { /* fail-open */ }
  }

  private scheduleAutoVerify(releaseId: string, attempt = 0): void {
    const overrideDelay = Number(process.env.WALKER_AUTO_VERIFY_DELAY_MS);
    if (process.env.NODE_ENV === 'test' && !(Number.isFinite(overrideDelay) && overrideDelay > 0)) return;
    if (!this.websiteVerifier || !this.releasesRepo || attempt >= AUTO_VERIFY_RETRY_DELAYS_MS.length) return;
    const delayMs = Number.isFinite(overrideDelay) && overrideDelay > 0 ? overrideDelay : AUTO_VERIFY_RETRY_DELAYS_MS[attempt]!;
    const isLast = attempt >= AUTO_VERIFY_RETRY_DELAYS_MS.length - 1;

    const existing = this.autoVerifyTimers.get(releaseId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.autoVerifyTimers.delete(releaseId);
      void this.verify(releaseId)
        .then(async (res) => {
          if (!res.verified && res.stage === 'VERIFYING') {
            if (isLast) await this.markAutoVerifyFailed(releaseId, res.reason || 'verify-timeout');
            else this.scheduleAutoVerify(releaseId, attempt + 1);
          }
        })
        .catch(async (err: unknown) => {
          if (isLast) await this.markAutoVerifyFailed(releaseId, (err instanceof Error ? err.message : '') || 'verify-error');
          else this.scheduleAutoVerify(releaseId, attempt + 1);
        });
    }, delayMs);
    timer.unref?.();
    this.autoVerifyTimers.set(releaseId, timer);
  }

  private async safeAppend(runId: string, event: TraceAppendInput): Promise<void> {
    try {
      await this.trace.append(runId, event);
    } catch (error) {
      this.log.error(`轨迹写入失败 runId=${runId}：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
