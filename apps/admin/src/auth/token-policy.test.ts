import { describe, expect, it } from 'vitest';
import { ADMIN_TOKEN_MIN_LENGTH, isValidAdminToken } from './token-policy';

describe('isValidAdminToken', () => {
  it('短于最小长度无效', () => {
    expect(isValidAdminToken('short')).toBe(false);
    expect(isValidAdminToken('x'.repeat(ADMIN_TOKEN_MIN_LENGTH - 1))).toBe(false);
  });

  it('达到最小长度有效（trim）', () => {
    expect(isValidAdminToken('x'.repeat(ADMIN_TOKEN_MIN_LENGTH))).toBe(true);
    expect(isValidAdminToken(`  ${'y'.repeat(ADMIN_TOKEN_MIN_LENGTH)}  `)).toBe(true);
  });
});
