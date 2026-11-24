/** 管理端内容应用服务 — 读取文件仓储，人工保存委托给受审计 mutation service。 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import matter from 'gray-matter';
import {
  buildContentBundle,
  computeTextDiff,
  CONTENT_BUNDLE_FORMAT,
  MAX_CONTENT_IMPORT_ITEMS,
  validateProjectMetadata,
  verifyContentBundle,
  type AllContentSocialStats,
  type ContentBundle,
  type ContentDeleteMode,
  type ContentDeleteResult,
  type ContentImportConflictPolicy,
  type ContentImportItemResult,
  type ContentImportRequest,
  type ContentImportResult,
  type ContentSocialStats,
  type SocialShareRecord,
} from '@walker/shared';
import { resolveContentLogDir } from '../adapters/content-log-dir';
import { resolveContentRepoRoot } from '../adapters/content-repo-dir';
import { deleteSingleArticle, discardLocalDraft, isTrackedInHead } from '../adapters/git-content-plumbing';
import { ApiError, validationError } from '../common/http-error';
import { newId } from '../common/ids';
import { ContentSyncService } from '../content-sync/content-sync.service';
import {
  CONTENT_FILE_REPOSITORY,
  type ContentFileRepositoryPort,
} from '../ports/content-file.repository';
import { CONTENT_LOCK, type ContentLockPort } from '../ports/content-lock.port';
import { CONTENT_MUTATION_SERVICE, type ContentMutationPort } from '../ports/content-mutation.port';
import { ARTICLE_VERSION_STORE, type ArticleVersionStorePort } from '../ports/article-version-store.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const normalizeLf = (s: string) => s.replace(/\r\n?/g, '\n');
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

@Injectable()
export class ContentAdminService {
  constructor(
    @Inject(CONTENT_FILE_REPOSITORY)
    private readonly files: ContentFileRepositoryPort,
    @Inject(CONTENT_MUTATION_SERVICE)
    private readonly mutations: ContentMutationPort,
    @Optional() @Inject(ARTICLE_VERSION_STORE)
    private readonly versions?: ArticleVersionStorePort,
    @Optional() @Inject(PRISMA)
    private readonly prisma?: PrismaPort,
    @Optional() @Inject(CONTENT_LOCK)
    private readonly contentLock?: ContentLockPort,
    @Optional() @Inject(ContentSyncService)
    private readonly syncService?: ContentSyncService,
  ) {}

  list() {
    return this.files.list();
  }

  async get(slug: string) {
    const doc = await this.files.get(slug);
    if (!doc) {
      throw new ApiError(
        'content-not-found',
        HttpStatus.NOT_FOUND,
        '内容不存在',
      );
    }
    return doc;
  }

  private async writeAudit(action: string, slug: string, outcome: string, beforeHash?: string | null, afterHash?: string | null) {
    const client = this.prisma?.getClient();
    if (!client) return;
    await client.auditRecord.create({
      data: {
        id: newId(),
        actor: 'owner',
        action,
        targetType: 'content',
        targetId: slug,
        outcome,
        beforeHash: beforeHash ?? null,
        afterHash: afterHash ?? null,
        requestId: newId(),
      },
    }).catch(() => undefined);
  }

  /**
   * 对称删除与草稿放弃：
   * - 未入 HEAD 的本地草稿仅删盘；
   * - 已入 GitHub HEAD 的文章通过无工作树 Plumbing 提交删除（保留 content/versions 历史）；
   * - discard-draft 将本地已改草稿还原回 HEAD 线上版。
   */
  async deleteDoc(slug: string, mode: ContentDeleteMode = 'auto'): Promise<ContentDeleteResult> {
    const doc = await this.get(slug);
    const logDir = await resolveContentLogDir().catch(() => null);
    const repoRoot = resolveContentRepoRoot();
    const inGitRepo = Boolean(repoRoot && logDir && path.resolve(logDir) === path.resolve(repoRoot, 'content/log'));

    if (mode === 'discard-draft') {
      if (!inGitRepo || !repoRoot) {
        throw new ApiError('git-unavailable', HttpStatus.CONFLICT, '当前内容目录未绑定 Git 版本库，无法还原线上版');
      }
      const restored = await discardLocalDraft({ repoRoot, slug, ext: doc.ext });
      if (!restored.ok) throw new ApiError('content-not-tracked', HttpStatus.CONFLICT, restored.error || '无法还原');
      await this.writeAudit('content.discard-draft', slug, 'restored', doc.hash, sha256(restored.restoredRaw!));
      return { ok: true, slug, scope: 'discard-draft', message: '已放弃未上线修改，恢复为线上版本' };
    }

    const tracked = inGitRepo && repoRoot ? await isTrackedInHead(repoRoot, slug, doc.ext) : false;
    if (!tracked) {
      if (mode === 'remote') {
        throw new ApiError('git-unavailable', HttpStatus.CONFLICT, '该文章尚未推送到 GitHub，无需远端下架');
      }
      const deleted = await this.files.delete(slug);
      if (!deleted) throw new ApiError('content-delete-failed', HttpStatus.INTERNAL_SERVER_ERROR, '删除内容文件失败');
      await this.writeAudit('content.delete', slug, 'deleted', doc.hash);
      return { ok: true, slug, scope: 'local-draft', message: '已删除本地草稿' };
    }

    if (mode === 'local-draft') {
      throw new ApiError('content-tracked-in-git', HttpStatus.CONFLICT, '文章已同步至 GitHub，不能仅删本地；请放弃修改或确认全网下架');
    }

    if (this.contentLock && (await this.contentLock.isLocked())) {
      throw new ApiError('content-locked', HttpStatus.CONFLICT, '工作区正在发布或同步，请稍后重试');
    }
    const lock = this.contentLock ? await this.contentLock.tryAcquire({ owner: 'content-admin-delete', ttlMs: 60_000 }) : null;
    if (this.contentLock && !lock) {
      throw new ApiError('content-locked', HttpStatus.CONFLICT, '获取内容锁失败，请稍后重试');
    }

    try {
      const res = await deleteSingleArticle({ repoRoot: repoRoot!, slug, ext: doc.ext });
      if (!res.ok) {
        if (res.conflict) throw new ApiError('content-delete-conflict', HttpStatus.CONFLICT, res.error || '远端已修改该文章，请先同步');
        throw new ApiError('content-delete-remote-failed', HttpStatus.BAD_GATEWAY, res.error || '远端下架删除失败');
      }
      await this.writeAudit('content.delete', slug, res.scope === 'remote' ? 'deleted-remote' : 'deleted', doc.hash, res.commit ?? null);
      if (res.scope === 'remote') this.syncService?.scheduleSnapshotSync();
      return {
        ok: true,
        slug,
        scope: res.scope,
        commit: res.commit ?? null,
        message: res.scope === 'remote' ? '已从 GitHub 删除并触发网站下架（历史版本已保留）' : '已删除本地草稿',
      };
    } finally {
      if (this.contentLock && lock) {
        await this.contentLock.release(lock.payload.lockId).catch(() => undefined);
      }
    }
  }

  /** 导出单篇 Markdown 或全站 `walker-content-bundle/v1` 内容包。 */
  async exportContent(slug?: string): Promise<ContentBundle | { slug: string; ext: '.md' | '.mdx'; sha256: string; raw: string; updatedAt: string }> {
    if (slug) {
      const doc = await this.get(slug);
      return { slug: doc.slug, ext: doc.ext, sha256: doc.hash, raw: doc.raw, updatedAt: doc.updatedAt };
    }
    const metas = await this.files.list();
    const docs = await Promise.all(metas.map((m) => this.files.get(m.slug)));
    const valid = docs.filter((d): d is NonNullable<typeof d> => Boolean(d));
    return buildContentBundle(valid.map((d) => ({ slug: d.slug, ext: d.ext, raw: d.raw, updatedAt: d.updatedAt })), sha256);
  }

  /**
   * 批量或单篇受控导入（支持 dryRun 预览、skip/overwrite 冲突策略与包签名校验）。
   * 每篇落盘严格复用 this.save（带 expectedHash CAS 与审计），不绕过正本写入边界。
   */
  async importContent(rawBody: unknown): Promise<ContentImportResult> {
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw validationError('导入请求必须是 JSON 对象');
    }
    const req = rawBody as Partial<ContentImportRequest & ContentBundle>;
    if (req.format === CONTENT_BUNDLE_FORMAT || req.bundleHash) {
      const checked = verifyContentBundle(rawBody, sha256);
      if (!checked.ok) throw validationError(checked.error);
    }
    if (!Array.isArray(req.items)) throw validationError('导入必须提供 items 数组');
    if (req.items.length > MAX_CONTENT_IMPORT_ITEMS) {
      throw validationError(`单次最多导入 ${MAX_CONTENT_IMPORT_ITEMS} 篇文章`);
    }

    const policy: ContentImportConflictPolicy = req.conflictPolicy === 'overwrite' ? 'overwrite' : 'skip';
    const dryRun = Boolean(req.dryRun);
    const items: ContentImportItemResult[] = [];
    let created = 0, updated = 0, unchanged = 0, skipped = 0, failed = 0;

    for (const entry of req.items) {
      const slug = typeof entry?.slug === 'string' ? entry.slug.trim() : '';
      const raw = typeof entry?.raw === 'string' ? normalizeLf(entry.raw) : '';
      if (!SLUG_RE.test(slug)) {
        failed++; items.push({ slug: slug || '(invalid)', status: 'error', message: 'slug 须为小写 ascii 短横线' }); continue;
      }
      if (!raw.trimStart().startsWith('---')) {
        failed++; items.push({ slug, status: 'error', message: '正文须以 YAML frontmatter --- 开头' }); continue;
      }
      const nextHash = sha256(raw);
      const existing = await this.files.get(slug);
      if (existing && existing.hash === nextHash) {
        unchanged++; items.push({ slug, status: 'unchanged', hash: nextHash }); continue;
      }
      if (existing && policy === 'skip') {
        skipped++; items.push({ slug, status: 'skip', hash: existing.hash, message: '已存在同 slug 文章，按策略跳过' }); continue;
      }
      if (dryRun) {
        if (existing) { updated++; items.push({ slug, status: 'update', hash: nextHash }); }
        else { created++; items.push({ slug, status: 'create', hash: nextHash }); }
        continue;
      }
      try {
        const saved = await this.save(slug, raw, existing ? existing.hash : null);
        if (existing) { updated++; items.push({ slug, status: 'update', hash: saved.hash }); }
        else { created++; items.push({ slug, status: 'create', hash: saved.hash }); }
      } catch (e) {
        failed++;
        items.push({ slug, status: 'error', message: e instanceof Error ? e.message : '导入保存失败' });
      }
    }

    if (!dryRun) {
      await this.writeAudit('content.import', 'bundle', `created:${created},updated:${updated},skipped:${skipped},failed:${failed}`);
    }
    return { ok: failed === 0, dryRun, total: req.items.length, created, updated, unchanged, skipped, failed, items };
  }

  async save(slug: string, raw: string, expectedHash: string | null) {
    // C22 项目字段校验：项目使用现有类型和字段进入受控保存
    let parsedData: Record<string, unknown> | null = null;
    try {
      const parsed = matter(raw);
      parsedData = (parsed.data ?? {}) as Record<string, unknown>;
    } catch {
      // 语法异常由后续流程或门禁捕获
    }

    if (parsedData?.type === 'project') {
      const validation = validateProjectMetadata(parsedData);
      if (!validation.valid) {
        throw new ApiError(
          'invalid-project-fields',
          HttpStatus.BAD_REQUEST,
          `项目字段校验失败：${validation.errors.join('，')}`,
        );
      }
    }

    try {
      return await this.mutations.saveManual({
        slug,
        raw,
        expectedHash,
        actor: 'owner',
        requestId: newId(),
      });
    } catch (e) {
      if (e instanceof ApiError) throw e;
      const msg = e instanceof Error ? e.message : 'save-failed';
      if (msg === 'invalid-slug') {
        throw new ApiError(
          'invalid-slug',
          HttpStatus.BAD_REQUEST,
          'slug 须为小写 ascii 短横线',
        );
      }
      if (msg === 'invalid-frontmatter') {
        throw new ApiError(
          'invalid-frontmatter',
          HttpStatus.BAD_REQUEST,
          '正文须以 YAML frontmatter --- 开头',
        );
      }
      if (msg === 'content-log-unavailable') {
        throw new ApiError(
          'content-log-unavailable',
          HttpStatus.SERVICE_UNAVAILABLE,
          '内容目录不可用',
        );
      }
      throw new ApiError(
        'content-save-failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
        msg,
      );
    }
  }

  // ---- 版本历史（只读；版本库为只追加公开区，此处无写路径） ----

  /** 列版本（不带正文） */
  async listVersions(slug: string) {
    if (!this.versions) throw new ApiError('article-versions-unavailable', HttpStatus.SERVICE_UNAVAILABLE, '版本库不可用');
    const index = await this.versions.readIndex(slug);
    return { slug, versions: index ? [...index.versions].reverse() : [] };
  }

  /** 看某版（带正文） */
  async getVersion(slug: string, version: number) {
    if (!this.versions) throw new ApiError('article-versions-unavailable', HttpStatus.SERVICE_UNAVAILABLE, '版本库不可用');
    const index = await this.versions.readIndex(slug);
    const entry = index?.versions.find((v) => v.version === version);
    if (!index || !entry) {
      throw new ApiError('article-version-not-found', HttpStatus.NOT_FOUND, '找不到该版本');
    }
    const body = await this.versions.readBody(entry.contentHash);
    if (body === null) {
      throw new ApiError('article-version-body-missing', HttpStatus.INTERNAL_SERVER_ERROR, '版本正文缺失');
    }
    return { slug, version: entry, body };
  }

  /** 比两版（diff 现算，不落盘） */
  async diffVersions(slug: string, a: number, b: number) {
    if (!this.versions) throw new ApiError('article-versions-unavailable', HttpStatus.SERVICE_UNAVAILABLE, '版本库不可用');
    const index = await this.versions.readIndex(slug);
    const va = index?.versions.find((v) => v.version === a);
    const vb = index?.versions.find((v) => v.version === b);
    if (!va || !vb) {
      throw new ApiError('article-version-not-found', HttpStatus.NOT_FOUND, '找不到该版本');
    }
    const [bodyA, bodyB] = await Promise.all([
      this.versions.readBody(va.contentHash),
      this.versions.readBody(vb.contentHash),
    ]);
    if (bodyA === null || bodyB === null) {
      throw new ApiError('article-version-body-missing', HttpStatus.INTERNAL_SERVER_ERROR, '版本正文缺失');
    }
    return { slug, a: va, b: vb, diff: computeTextDiff(bodyA, bodyB) };
  }

  // ---- 社交媒体宣发与同步追踪 ----

  async recordSocialShare(
    slug: string,
    payload: { channel?: string; angle?: string; note?: string; actor?: string },
  ): Promise<{ ok: boolean; record: SocialShareRecord; stats: ContentSocialStats }> {
    await this.get(slug);
    const client = this.prisma?.getClient();
    if (!client) {
      throw new ApiError('database-unavailable', HttpStatus.SERVICE_UNAVAILABLE, '数据库连接不可用');
    }

    const id = newId();
    const createdAt = new Date();
    const channel = payload.channel || 'x';
    const angle = payload.angle || 'overview';
    const note = payload.note || null;
    const actor = payload.actor || 'admin';

    await client.auditRecord.create({
      data: {
        id,
        actor,
        action: 'content.social-share',
        targetType: 'content',
        targetId: slug,
        outcome: channel,
        beforeHash: angle,
        afterHash: note,
        requestId: newId(),
        createdAt,
      },
    });

    const stats = await this.getSocialStats(slug);
    const record: SocialShareRecord = {
      id,
      slug,
      channel,
      angle,
      note,
      createdAt: createdAt.toISOString(),
    };

    return { ok: true, record, stats };
  }

  async getSocialStats(slug: string): Promise<ContentSocialStats> {
    const client = this.prisma?.getClient();
    if (!client) {
      return { slug, shareCount: 0, lastSharedAt: null, records: [] };
    }

    const rows = await client.auditRecord.findMany({
      where: {
        targetType: 'content',
        targetId: slug,
        action: 'content.social-share',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const records: SocialShareRecord[] = rows.map((r) => ({
      id: r.id,
      slug: r.targetId,
      channel: r.outcome,
      angle: r.beforeHash,
      note: r.afterHash,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      slug,
      shareCount: records.length,
      lastSharedAt: records[0]?.createdAt ?? null,
      records,
    };
  }

  async getAllSocialStatsSummary(): Promise<AllContentSocialStats> {
    const client = this.prisma?.getClient();
    if (!client) {
      return {};
    }

    const rows = await client.auditRecord.findMany({
      where: {
        targetType: 'content',
        action: 'content.social-share',
      },
      select: {
        targetId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const result: AllContentSocialStats = {};
    for (const row of rows) {
      const slug = row.targetId;
      const iso = row.createdAt.toISOString();
      if (!result[slug]) {
        result[slug] = { shareCount: 1, lastSharedAt: iso };
      } else {
        result[slug].shareCount += 1;
      }
    }

    return result;
  }
}
