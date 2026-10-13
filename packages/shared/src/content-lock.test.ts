import { describe, expect, it } from 'vitest';
import {
  CONTENT_LOCK_DEFAULT_TTL_MS,
  isContentLockExpired,
  parseContentLockPayload,
  type ContentLockPayload,
} from './content-lock.js';

describe('content-lock protocol (C13 共享内容发布锁协议)', () => {
  it('正确解析合法的锁负载结构', () => {
    const raw = {
      lockId: 'lock-001',
      owner: 'script:content-publish:1234',
      pid: 1234,
      acquiredAt: '2026-09-25T10:00:00.000Z',
      expiresAt: '2026-09-25T10:05:00.000Z',
      targetSlug: 'post-a',
      manifestHash: 'a'.repeat(64),
    };
    const parsed = parseContentLockPayload(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.lockId).toBe('lock-001');
    expect(parsed?.owner).toBe('script:content-publish:1234');
    expect(parsed?.pid).toBe(1234);
    expect(parsed?.targetSlug).toBe('post-a');
    expect(parsed?.manifestHash).toBe('a'.repeat(64));
  });

  it('残缺或非法的负载结构解析返回 null', () => {
    expect(parseContentLockPayload(null)).toBeNull();
    expect(parseContentLockPayload({})).toBeNull();
    expect(parseContentLockPayload({ lockId: '123' })).toBeNull();
    expect(parseContentLockPayload({ lockId: '123', owner: 'me', pid: 'not-a-number' })).toBeNull();
  });

  it('能准确判定锁是否超时失效', () => {
    const now = Date.now();
    const activeLock: ContentLockPayload = {
      lockId: 'lock-active',
      owner: 'api',
      pid: 1,
      acquiredAt: new Date(now - 10_000).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(),
    };
    expect(isContentLockExpired(activeLock, now)).toBe(false);

    const expiredLock: ContentLockPayload = {
      lockId: 'lock-expired',
      owner: 'crashed-proc',
      pid: 9999,
      acquiredAt: new Date(now - 400_000).toISOString(),
      expiresAt: new Date(now - 100_000).toISOString(),
    };
    expect(isContentLockExpired(expiredLock, now)).toBe(true);

    const invalidDateLock: ContentLockPayload = {
      ...activeLock,
      expiresAt: 'invalid-date',
    };
    expect(isContentLockExpired(invalidDateLock, now)).toBe(true);
  });
});
