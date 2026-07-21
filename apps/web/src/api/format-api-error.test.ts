import { describe, expect, it } from 'vitest';
import { ApiError } from './http';
import { formatApiError } from './format-api-error';

describe('formatApiError', () => {
  it('ApiError 走 explainErrorCode', () => {
    const msg = formatApiError(new ApiError('guest-quota-exceeded', 'x'));
    expect(msg).toMatch(/游客|配额|用完/);
  });

  it('普通 Error 用 message', () => {
    expect(formatApiError(new Error('网络断了'))).toBe('网络断了');
  });

  it('未知值 String()', () => {
    expect(formatApiError(42)).toBe('42');
  });
});
