import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import {
  CONTENT_LOCK_DEFAULT_TTL_MS,
  isContentLockExpired,
  parseContentLockPayload,
  type ContentLockPayload,
} from '@walker/shared';
import type { ContentLockPort, ContentLockRecord } from '../ports/content-lock.port';

function resolveDefaultLockPath(): string {
  const fromEnv = process.env.WALKER_CONTENT_LOCK_PATH?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  const cwd = process.cwd();
  if (cwd.endsWith('/apps/api') || cwd.endsWith('\\apps\\api') || cwd.endsWith('apps/api') || cwd.endsWith('apps\\api')) {
    return path.resolve(cwd, 'data/content-publish.lock');
  }
  return path.resolve(cwd, 'apps/api/data/content-publish.lock');
}

function processAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

@Injectable()
export class FsContentLock implements ContentLockPort {
  private readonly lockFile: string;

  constructor(lockFilePath?: string) {
    this.lockFile = path.resolve(lockFilePath ?? resolveDefaultLockPath());
  }

  async tryAcquire(input: {
    owner: string;
    targetSlug?: string;
    manifestHash?: string;
    ttlMs?: number;
  }): Promise<ContentLockRecord | null> {
    const now = Date.now();
    const ttl = input.ttlMs ?? CONTENT_LOCK_DEFAULT_TTL_MS;
    const payload: ContentLockPayload = {
      lockId: randomUUID(),
      owner: input.owner,
      pid: process.pid,
      acquiredAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttl).toISOString(),
      targetSlug: input.targetSlug ?? null,
      manifestHash: input.manifestHash ?? null,
    };

    await fs.mkdir(path.dirname(this.lockFile), { recursive: true });
    try {
      await fs.access(`${this.lockFile}.recovery`);
      return null;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }

    try {
      await fs.writeFile(this.lockFile, JSON.stringify(payload, null, 2), { flag: 'wx' });
      return { payload, lockFile: this.lockFile };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }

    // 锁文件已存在：检查是否超时或持有者进程崩溃 (可核验恢复机制)
    let existingPayload: ContentLockPayload | null = null;
    try {
      const raw = await fs.readFile(this.lockFile, 'utf8');
      existingPayload = parseContentLockPayload(JSON.parse(raw));
    } catch {
      return null; // 无法证明锁已失效时保持关闭
    }

    if (existingPayload && isContentLockExpired(existingPayload, now) && !processAlive(existingPayload.pid)) {
      // 一次只允许一个恢复者复检并替换旧锁；直接并发 rename 会让两方都误以为拿到锁。
      const recoveryFile = `${this.lockFile}.recovery`;
      try {
        await fs.writeFile(recoveryFile, JSON.stringify({ pid: process.pid, at: now }), { flag: 'wx' });
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') return null;
        throw err;
      }
      try {
        const current = parseContentLockPayload(JSON.parse(await fs.readFile(this.lockFile, 'utf8')));
        if (!current || current.lockId !== existingPayload.lockId ||
            !isContentLockExpired(current, Date.now()) || processAlive(current.pid)) return null;
        const temp = `${this.lockFile}.${randomUUID()}.tmp`;
        try {
          await fs.writeFile(temp, JSON.stringify(payload, null, 2));
          await fs.rename(temp, this.lockFile);
        } finally {
          await fs.rm(temp, { force: true }).catch(() => {});
        }
        return { payload, lockFile: this.lockFile };
      } finally {
        await fs.rm(recoveryFile, { force: true }).catch(() => {});
      }
    }

    return null;
  }

  async release(lockId: string): Promise<boolean> {
    let raw: string;
    try {
      raw = await fs.readFile(this.lockFile, 'utf8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return true;
      throw err;
    }

    let payload: ContentLockPayload | null = null;
    try {
      payload = parseContentLockPayload(JSON.parse(raw));
    } catch {
      // 损坏的文件直接清除
      await fs.rm(this.lockFile, { force: true });
      return true;
    }

    if (payload && payload.lockId === lockId) {
      await fs.rm(this.lockFile, { force: true });
      return true;
    }

    return false;
  }

  async inspect(): Promise<ContentLockRecord | null> {
    try {
      const raw = await fs.readFile(this.lockFile, 'utf8');
      const payload = parseContentLockPayload(JSON.parse(raw));
      if (!payload) return null;
      return { payload, lockFile: this.lockFile };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async isLocked(): Promise<boolean> {
    try {
      await fs.access(`${this.lockFile}.recovery`);
      return true;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    let raw: string;
    try {
      raw = await fs.readFile(this.lockFile, 'utf8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }
    let payload: ContentLockPayload | null = null;
    try {
      payload = parseContentLockPayload(JSON.parse(raw));
    } catch {
      return true;
    }
    if (!payload) return true;
    return processAlive(payload.pid) || !isContentLockExpired(payload);
  }
}
