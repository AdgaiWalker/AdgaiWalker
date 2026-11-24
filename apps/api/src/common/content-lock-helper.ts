import type { ContentLockPort, ContentLockRecord } from '../ports/content-lock.port';

export type ContentLockOutcome<T> =
  | { acquired: true; value: T }
  | { acquired: false; reason: 'already-locked' | 'acquire-failed' };

/**
 * 统一封装全工作区内容锁的检查、获取与 finally 安全释放。
 * 当未配置锁端口时直接执行操作（便于无锁单测/环境透传）。
 */
export async function runWithContentLock<T>(
  lock: ContentLockPort | undefined,
  acquireOpts: Parameters<ContentLockPort['tryAcquire']>[0],
  fn: (record: ContentLockRecord | null) => Promise<T>,
  opts?: { checkIsLockedFirst?: boolean },
): Promise<ContentLockOutcome<T>> {
  if (!lock) {
    return { acquired: true, value: await fn(null) };
  }
  if (opts?.checkIsLockedFirst && (await lock.isLocked())) {
    return { acquired: false, reason: 'already-locked' };
  }
  const record = await lock.tryAcquire(acquireOpts);
  if (!record) {
    return { acquired: false, reason: 'acquire-failed' };
  }
  try {
    return { acquired: true, value: await fn(record) };
  } finally {
    await lock.release(record.payload.lockId).catch(() => undefined);
  }
}
