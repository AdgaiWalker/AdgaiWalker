import { describe, expect, it } from 'vitest';

import { isPersistent, isWritable, resolveStorageMode } from './storage-mode';

describe('resolveStorageMode', () => {
  it('returns redis when a real redis connection is available', () => {
    expect(resolveStorageMode({ hasRedis: true, environment: 'production' })).toBe('redis');
    expect(resolveStorageMode({ hasRedis: true, environment: 'development' })).toBe('redis');
  });

  it('falls back to memory-development in development or test without redis', () => {
    expect(resolveStorageMode({ hasRedis: false, environment: 'development' }))
      .toBe('memory-development');
    expect(resolveStorageMode({ hasRedis: false, environment: 'test' }))
      .toBe('memory-development');
  });

  it('returns unavailable when production has no redis (no silent memory fallback)', () => {
    expect(resolveStorageMode({ hasRedis: false, environment: 'production' }))
      .toBe('unavailable');
    expect(resolveStorageMode({ hasRedis: false, environment: 'preview' }))
      .toBe('unavailable');
  });
});

describe('isWritable / isPersistent', () => {
  it('marks redis as writable and persistent', () => {
    expect(isWritable('redis')).toBe(true);
    expect(isPersistent('redis')).toBe(true);
  });

  it('marks memory-development as writable but not persistent', () => {
    expect(isWritable('memory-development')).toBe(true);
    expect(isPersistent('memory-development')).toBe(false);
  });

  it('marks unavailable as not writable and not persistent', () => {
    expect(isWritable('unavailable')).toBe(false);
    expect(isPersistent('unavailable')).toBe(false);
  });
});
