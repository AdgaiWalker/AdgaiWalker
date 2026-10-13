import type { ContentLockPayload } from '@walker/shared';

export interface ContentLockRecord {
  payload: ContentLockPayload;
  lockFile: string;
}

export interface ContentLockPort {
  /**
   * 尝试原子获取全工作区内容发布锁。
   * 若锁未被占用，或已被占用但已超时/原持有进程崩溃，则原子接管并返回记录；否则返回 null。
   */
  tryAcquire(input: {
    owner: string;
    targetSlug?: string;
    manifestHash?: string;
    ttlMs?: number;
  }): Promise<ContentLockRecord | null>;

  /**
   * 释放锁。仅当持有者 lockId 匹配时允许释放。
   */
  release(lockId: string): Promise<boolean>;

  /**
   * 检查当前锁状态（只读观察）。
   */
  inspect(): Promise<ContentLockRecord | null>;

  /** A live holder remains active even if its lease timestamp has elapsed. */
  isLocked(): Promise<boolean>;
}

export const CONTENT_LOCK = Symbol('CONTENT_LOCK');
