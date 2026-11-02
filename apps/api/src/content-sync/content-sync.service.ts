import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import type { ContentSyncPullResult, ContentSyncStatus } from '@walker/shared';
import { CONTENT_LOCK, type ContentLockPort } from '../ports/content-lock.port';

const execFileAsync = promisify(execFile);

function resolveRepoRoot(): string {
  let dir: string | undefined = process.cwd();
  while (dir) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

@Injectable()
export class ContentSyncService {
  private readonly logger = new Logger(ContentSyncService.name);
  private cachedStatus: ContentSyncStatus | null = null;
  private lastFetchTime = 0;

  constructor(
    @Optional()
    @Inject(CONTENT_LOCK)
    private readonly lock?: ContentLockPort,
  ) {}

  /**
   * 获取当前工作区与 GitHub 远端的同步状态
   * @param forceFetch 是否强制发起远程 git fetch（默认 15 秒缓存）
   */
  async getStatus(forceFetch = false): Promise<ContentSyncStatus> {
    const cwd = resolveRepoRoot();
    const now = Date.now();

    // 默认 15 秒缓存探测，避免频繁页面渲染刷爆 GitHub 连接
    const shouldFetch = forceFetch || now - this.lastFetchTime > 15_000 || !this.cachedStatus;

    if (shouldFetch) {
      try {
        await execFileAsync('git', ['fetch', 'origin', 'main'], {
          cwd,
          timeout: 10_000,
          windowsHide: true,
        });
        this.lastFetchTime = now;
      } catch (err: unknown) {
        this.logger.warn(`git fetch origin main 失败（如实降级）：${err instanceof Error ? err.message : String(err)}`);
        // fetch 失败时不抛异常，如实按照本地现有指针比对
      }
    }

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

      // 获取当前未提交的内容草稿文件
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

      this.cachedStatus = {
        available: true,
        behind,
        ahead,
        headCommit,
        remoteCommit,
        dirtyFiles,
        incomingFiles,
        lastCheckedAt: new Date().toISOString(),
      };

      return this.cachedStatus;
    } catch (err: unknown) {
      this.logger.error(`获取 Git 同步状态异常: ${err instanceof Error ? err.message : String(err)}`);
      return {
        available: false,
        behind: 0,
        ahead: 0,
        headCommit: null,
        remoteCommit: null,
        dirtyFiles: [],
        incomingFiles: [],
        lastCheckedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * 从 GitHub 安全拉取最新提交并刷新内容投影
   */
  async pull(): Promise<ContentSyncPullResult> {
    const cwd = resolveRepoRoot();

    // 检查是否有发布流程正在进行
    if (this.lock) {
      const isLocked = await this.lock.isLocked();
      if (isLocked) {
        return {
          ok: false,
          pulledCommits: 0,
          incomingFiles: [],
          message: '工作区当前正处于发布加锁状态，请等待发布完成后再同步',
        };
      }
    }

    // 获取一次当前最新状态，记录本次即将拉取的文章
    const preStatus = await this.getStatus(true);
    if (!preStatus.available) {
      return {
        ok: false,
        pulledCommits: 0,
        incomingFiles: [],
        message: 'Git 环境不可用，无法同步',
      };
    }

    if (preStatus.behind === 0) {
      return {
        ok: true,
        pulledCommits: 0,
        incomingFiles: [],
        message: '当前已是最新，无待拉取提交',
      };
    }

    let lockRecord = null;
    if (this.lock) {
      lockRecord = await this.lock.tryAcquire({
        owner: 'content-sync-pull',
        ttlMs: 60_000,
      });
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
      this.logger.log(`开始从 GitHub origin/main 拉取同步 (behind: ${preStatus.behind})...`);
      const pullRes = await execFileAsync('git', ['pull', 'origin', 'main', '--rebase', '--autostash'], {
        cwd,
        timeout: 45_000,
        windowsHide: true,
      });

      this.logger.log(`git pull 完成: ${pullRes.stdout.trim()}`);

      // 拉取成功后，执行投影编译与新文章版本补票
      try {
        await execFileAsync('pnpm', ['content:backfill-versions'], {
          cwd,
          shell: process.platform === 'win32',
          timeout: 30_000,
        });
      } catch (e) {
        this.logger.warn(`content:backfill-versions 告警（不阻断）：${e}`);
      }

      try {
        await execFileAsync('pnpm', ['content:gen'], {
          cwd,
          shell: process.platform === 'win32',
          timeout: 30_000,
        });
      } catch (e) {
        this.logger.warn(`content:gen 告警（不阻断）：${e}`);
      }

      // 重置缓存以反映最新状态
      this.cachedStatus = null;
      this.lastFetchTime = 0;
      await this.getStatus(false);

      const count = preStatus.incomingFiles.length;
      const fileNames = preStatus.incomingFiles.slice(0, 3).join('、');
      const extra = count > 3 ? ` 等共 ${count} 篇` : '';

      return {
        ok: true,
        pulledCommits: preStatus.behind,
        incomingFiles: preStatus.incomingFiles,
        message: count > 0
          ? `已成功从 GitHub 同步 ${preStatus.behind} 个提交，更新文章：${fileNames}${extra}`
          : `已成功从 GitHub 同步 ${preStatus.behind} 个提交`,
        stdout: pullRes.stdout,
      };
    } catch (err: unknown) {
      this.logger.error(`git pull 异常，尝试回滚 rebase：${err instanceof Error ? err.message : String(err)}`);
      await execFileAsync('git', ['rebase', '--abort'], { cwd, windowsHide: true }).catch(() => null);

      return {
        ok: false,
        pulledCommits: 0,
        incomingFiles: [],
        message: `同步失败（可能存在文件冲突）：${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      if (this.lock && lockRecord) {
        await this.lock.release(lockRecord.payload.lockId).catch(() => null);
      }
    }
  }

  /**
   * 处理 GitHub Webhook 自动推送通知
   */
  async handleWebhook(payload: Record<string, unknown>): Promise<{ ok: boolean; status: string; message: string }> {
    const ref = typeof payload.ref === 'string' ? payload.ref : '';
    if (ref !== 'refs/heads/main') {
      return { ok: true, status: 'ignored', message: `非 main 分支推送 (${ref})，跳过` };
    }

    // 异步排队拉取
    setImmediate(async () => {
      try {
        this.logger.log('GitHub Webhook 触发自动静默同步...');
        const res = await this.pull();
        this.logger.log(`Webhook 自动同步结果: ${res.message}`);
      } catch (err) {
        this.logger.error(`Webhook 自动同步异常: ${err}`);
      }
    });

    return { ok: true, status: 'scheduled', message: '已安排后台同步 GitHub 最新内容' };
  }
}
