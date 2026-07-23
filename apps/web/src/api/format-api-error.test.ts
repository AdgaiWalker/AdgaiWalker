import { describe, expect, it } from 'vitest';
import { ApiError } from './http';
import { formatApiError } from './format-api-error';

describe('formatApiError', () => {
  it('ApiError 走 explainErrorCode', () => {
    const msg = formatApiError(new ApiError('guest-quota-exceeded', 'x'));
    expect(msg).toMatch(/游客|配额|用完/);
  });

  it('network-error 给诚实人话', () => {
    expect(formatApiError(new ApiError('network-error'))).toMatch(
      /连不上|API|逛/,
    );
  });

  it('Failed to fetch 映射为服务不可用', () => {
    expect(formatApiError(new Error('Failed to fetch'))).toMatch(
      /连不上|API|逛/,
    );
  });

  it('普通 Error 用 message', () => {
    expect(formatApiError(new Error('自定义错误'))).toBe('自定义错误');
  });

  it('未知值 String()', () => {
    expect(formatApiError(42)).toBe('42');
  });
});
