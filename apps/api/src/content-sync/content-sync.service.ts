import { Inject, Injectable, Logger, Optional, type OnModuleDestroy } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import {
  verifyPublicSnapshot,
  type ContentDraftBackupResult,
  type ContentSyncPullResult,
  type ContentSyncStatus,
} from '@walker/shared';
import { CONTENT_LOCK, type ContentLockPort } from '../ports/content-lock.port';
import {
  PUBLIC_SNAPSHOT_REPOSITORY,
  type PublicSnapshotRepositoryPort,
  type VerifiedPublicSnapshot,
} from '../ports/public-snapshot.repository';
import { resolveContentRepoRoot } from '../adapters/content-repo-dir';
import { backupDraftsToBranch, syncFromRemote } from '../adapters/git-content-plumbing';

const execFileAsync = promisify(execFile);
const CACHE_TTL_MS = 30_000;
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

@Injectable()
export class ContentSyncService implements OnModuleDestroy {
  private readonly logger = new Logger(ContentSyncService.name);
  private cachedStatus: ContentSyncStatus | null = null;
  private lastFetchTime = 0;
  private lastFetchError: string | null = null;
  private lastConflicts: string[] = [];
  private lastDraftBackupCommit: string | null = null;
  private inflightFetch: Promise<void> | null = null;
  private webhookQueued = false;
  private snapshotSyncTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    @Optional()
    @Inject(CONTENT_LOCK)
    private readonly lock?: ContentLockPort,
    @Optional()
    @Inject(PUBLIC_SNAPSHOT_REPOSITORY)
    private readonly snapshots?: PublicSnapshotRepositoryPort,
  ) {}

  onModuleDestroy(): void {
    if (this.snapshotSyncTimer) {
      clearTimeout(this.snapshotSyncTimer);
      this.snapshotSyncTimer = null;
    }
  }

  /**
   * 获取当前内容仓与 GitHub 远端的同步状态。
   * - 非强制模式（forceFetch=false）：命中缓存直接毫秒级返回，过期时仅异步后台单飞刷新，不阻塞 HTTP；
   * - 强制模式（forceFetch=true）：显式等待一次远端 fetch，且 fetch 失败如实写入 fetchError（绝不假绿灯）。
   */
  async getStatus(forceFetch = false): Promise<ContentSyncStatus> {
    const cwd = resolveContentRepoRoot();
    if (!cwd) {
      return {
        available: false,
        behind: 0,
        ahead: 0,
        headCommit: null,
        remoteCommit: null,
        dirtyFiles: [],
        incomingFiles: [],
        lastCheckedAt: new Date().toISOString(),
        fetchError: 'content-repo-root-not-found',
      };
    }

    const now = Date.now();
    const isStale = now - this.lastFetchTime > CACHE_TTL_MS;

    if (forceFetch) {
      await this.fetchRemoteOnce(cwd);
    } else if (this.cachedStatus) {
      if (isStale) {
        void this.refreshInBackground(cwd);
      }
      return this.cachedStatus;
    } else if (process.env.NODE_ENV !== 'test') {
      // 首次冷查非阻断：先立即返回本地快照并后台单飞拉取远端指针
      void this.refreshInBackground(cwd);
    }

    return this.buildSnapshot(cwd);
  }

  private async fetchRemoteOnce(cwd: string): Promise<void> {
    if (this.inflightFetch) {
      await this.inflightFetch;
      return;
    }
    this.inflightFetch = (async () => {
      try {
        await execFileAsync('git', ['fetch', 'origin', 'main'], {
          cwd,
          timeout: 15_000,
          windowsHide: true,
        });
        this.lastFetchTime = Date.now();
        this.lastFetchError = null;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.lastFetchError = msg.split('\n')[0]?.slice(0, 180) || 'git-fetch-failed';
        this.logger.warn(`git fetch origin main 失败（已如实上报 fetchError）：${this.lastFetchError}`);
      } finally {
        this.inflightFetch = null;
      }
    })();
    await this.inflightFetch;
  }

  private async refreshInBackground(cwd: string): Promise<void> {
    try {
      await this.fetchRemoteOnce(cwd);
      await this.buildSnapshot(cwd);
    } catch {
      // fail-open：错误已记在 lastFetchError
    }
  }

  private async buildSnapshot(cwd: string): Promise<ContentSyncStatus> {
    try {
      const [headRes, remoteRes] = await Promise.all([
        execFileAsync('git', ['rev-parse', 'HEAD'], { cwd, windowsHide: true }),
        execFileAsync('git', ['rev-parse', 'origin/main'], { cwd, windowsHide: true }).catch(() => ({ stdout: '' })),
      ]);

      const headCommit = headRes.stdout.trim() || null;
      const remoteCommit = remoteRes.stdout.trim() || null;

      let behind = 0;
      let ahead = 0;
      let incomingFiles: string[] = [];

      if (headCommit && remoteCommit) {
        const [behindRes, aheadRes, diffRes] = await Promise.all([
          execFileAsync('git', ['rev-list', '--count', 'HEAD..origin/main'], { cwd, windowsHide: true }).catch(() => ({ stdout: '0' })),
          execFileAsync('git', ['rev-list', '--count', 'origin/main..HEAD'], { cwd, windowsHide: true }).catch(() => ({ stdout: '0' })),
          execFileAsync('git', ['diff', '--name-only', 'HEAD..origin/main', '--', 'content/log'], { cwd, windowsHide: true }).catch(() => ({ stdout: '' })),
        ]);

        behind = parseInt(behindRes.stdout.trim(), 10) || 0;
        ahead = parseInt(aheadRes.stdout.trim(), 10) || 0;
        incomingFiles = diffRes.stdout
          .split('\n')
          .map((f) => f.trim())
          .filter(Boolean)
          .map((f) => path.basename(f));
      }

      const dirtyRes = await execFileAsync('git', ['status', '--porcelain', '-z', '--', 'content/log'], {
        cwd,
        windowsHide: true,
      }).catch(() => ({ stdout: '' }));

      const dirtyFiles: string[] = [];
      const dirtyRecords = dirtyRes.stdout.split('\0').filter(Boolean);
      for (const rec of dirtyRecords) {
        const file = rec.slice(3);
        if (file) dirtyFiles.push(path.basename(file));
      }

      // 若之前记录的冲突文件已不再脏，自动消除冲突提示
      const dirtySet = new Set(dirtyFiles);
      this.lastConflicts = this.lastConflicts.filter((file) => dirtySet.has(file));

      this.cachedStatus = {
        available: true,
        behind,
        ahead,
        headCommit,
        remoteCommit,
        dirtyFiles,
        incomingFiles,
        lastCheckedAt: new Date().toISOString(),
        fetchError: this.lastFetchError,
        conflicts: [...this.lastConflicts],
        draftBackupCommit: this.lastDraftBackupCommit,
      };
      return this.cachedStatus;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`获取 Git 同步状态异常: ${msg}`);
      return {
        available: false,
        behind: 0,
        ahead: 0,
        headCommit: null,
        remoteCommit: null,
        dirtyFiles: [],
        incomingFiles: [],
        lastCheckedAt: new Date().toISOString(),
        fetchError: msg.split('\n')[0]?.slice(0, 180) || 'git-unavailable',
      };
    }
  }

  /**
   * 3-way 安全拉取：不跑 git pull --rebase --autostash，不跑 pnpm content:gen。
   * 保留无关本地草稿；同篇并发冲突显式回报并保留本地草稿不覆盖。
   */
  async pull(): Promise<ContentSyncPullResult> {
    const cwd = resolveContentRepoRoot();
    if (!cwd) {
      return { ok: false, pulledCommits: 0, incomingFiles: [], message: '内容仓目录不可用，无法同步' };
    }

    if (this.lock && (await this.lock.isLocked())) {
      return {
        ok: false,
        pulledCommits: 0,
        incomingFiles: [],
        message: '工作区当前正处于发布加锁状态，请等待发布完成后再同步',
      };
    }

    let lockRecord = null;
    if (this.lock) {
      lockRecord = await this.lock.tryAcquire({ owner: 'content-sync-pull', ttlMs: 60_000 });
      if (!lockRecord) {
        return {
          ok: false,
          pulledCommits: 0,
          incomingFiles: [],
          message: '获取内容锁失败，可能有其他发布或同步正在进行',
        };
      }
    }

    try {
      const result = await syncFromRemote({ repoRoot: cwd });
      this.lastFetchTime = Date.now();
      this.lastFetchError = result.ok || (result.conflicts?.length ?? 0) > 0 ? null : result.message;
      this.lastConflicts = (result.conflicts ?? []).map((c) => path.basename(c.path));
      this.cachedStatus = null;
      await this.buildSnapshot(cwd);
      return result;
    } finally {
      if (this.lock && lockRecord) {
        await this.lock.release(lockRecord.payload.lockId).catch(() => null);
      }
    }
  }

  /** 将未发布的本地草稿备份到 GitHub 独立 drafts 分支（绝不触碰 main） */
  async backupDrafts(): Promise<ContentDraftBackupResult> {
    const cwd = resolveContentRepoRoot();
    if (!cwd) {
      return { ok: false, branch: 'drafts', commit: null, backedUpFiles: [], message: '内容仓目录不可用' };
    }

    let lockRecord = null;
    if (this.lock) {
      lockRecord = await this.lock.tryAcquire({ owner: 'content-sync-draft-backup', ttlMs: 60_000 });
      if (!lockRecord) {
        return { ok: false, branch: 'drafts', commit: null, backedUpFiles: [], message: '内容锁正被占用，请稍后重试' };
      }
    }

    try {
      const res = await backupDraftsToBranch({ repoRoot: cwd });
      if (res.ok && res.commit) {
        this.lastDraftBackupCommit = res.commit;
        this.cachedStatus = null;
      }
      return res;
    } finally {
      if (this.lock && lockRecord) {
        await this.lock.release(lockRecord.payload.lockId).catch(() => null);
      }
    }
  }

  /** 处理已通过 HMAC-SHA256 验签的 GitHub Webhook 推送事件（单飞防风暴） */
  async handleWebhook(payload: Record<string, unknown>): Promise<{ ok: boolean; status: string; message: string }> {
    const ref = typeof payload.ref === 'string' ? payload.ref : '';
    if (ref !== 'refs/heads/main') {
      return { ok: true, status: 'ignored', message: `非 main 分支推送 (${ref})，跳过` };
    }

    if (this.webhookQueued) {
      return { ok: true, status: 'coalesced', message: '后台同步已在排队，合并本次通知' };
    }
    this.webhookQueued = true;

    setImmediate(async () => {
      try {
        this.logger.log('GitHub Webhook 触发 3-way 自动同步...');
        const res = await this.pull();
        this.logger.log(`Webhook 自动同步结果: ${res.message}`);
        if (res.ok && res.pulledCommits > 0) {
          this.scheduleSnapshotSync();
        }
      } catch (err) {
        this.logger.error(`Webhook 自动同步异常: ${err}`);
      } finally {
        this.webhookQueued = false;
      }
    });

    return { ok: true, status: 'scheduled', message: '已安排后台同步 GitHub 最新内容' };
  }

  /** 拉取线上已部署 public-manifest.json 并刷新本地问答快照指针（fail-open）。 */
  async syncPublicSnapshotFromLive(siteBase?: string): Promise<boolean> {
    if (!this.snapshots) return false;
    const base = (siteBase || process.env.PUBLIC_SITE_URL?.trim() || 'https://www.iwalk.pro').replace(/\/$/, '');
    try {
      const res = await fetch(`${base}/public-manifest.json?_t=${Date.now()}`, {
        signal: AbortSignal.timeout(10_000),
        headers: { accept: 'application/json', 'cache-control': 'no-cache, no-store, must-revalidate' },
      });
      if (!res.ok) return false;
      const raw = (await res.json()) as unknown;
      if (!verifyPublicSnapshot(raw, sha256)) return false;
      const manifest = raw as VerifiedPublicSnapshot;
      const active = await this.snapshots.readActive().catch(() => null);
      if (active?.collectionHash === manifest.collectionHash) return true;
      await this.snapshots.publish(manifest);
      this.logger.log(`问答快照已自动对齐线上构建: ${manifest.collectionHash.slice(0, 12)} (${manifest.items.length} 条)`);
      return true;
    } catch {
      return false;
    }
  }

  /** Mac 推送或后台下架后，延迟对齐 Vercel 新产出的 public-manifest.json 至小影问答快照。 */
  scheduleSnapshotSync(attempt = 0): void {
    const overrideDelay = Number(process.env.WALKER_AUTO_VERIFY_DELAY_MS);
    if (process.env.NODE_ENV === 'test' && !(Number.isFinite(overrideDelay) && overrideDelay > 0)) {
      return;
    }
    if (!this.snapshots) return;
    const delays = [45_000, 105_000];
    if (attempt >= delays.length) return;
    const delayMs = Number.isFinite(overrideDelay) && overrideDelay > 0 ? overrideDelay : delays[attempt]!;
    if (this.snapshotSyncTimer) clearTimeout(this.snapshotSyncTimer);
    this.snapshotSyncTimer = setTimeout(() => {
      this.snapshotSyncTimer = null;
      void this.syncPublicSnapshotFromLive().then((synced) => {
        if (!synced) this.scheduleSnapshotSync(attempt + 1);
      });
    }, delayMs);
    this.snapshotSyncTimer.unref?.();
  }
}
