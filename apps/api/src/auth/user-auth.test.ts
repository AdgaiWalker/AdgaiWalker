import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { resolveAuthContext } from './user-auth';

describe('resolveAuthContext', () => {
  it('未提供 token 时，默认返回访客上下文与有效 anonId', () => {
    const setHeader = vi.fn();
    const req = { headers: {} } as unknown as Request;
    const res = { setHeader } as unknown as Response;

    const ctx = resolveAuthContext(req, res);
    expect(ctx.actorType).toBe('guest');
    expect(ctx.anonId).toBeTruthy();
    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('walker-anon='));
  });

  it('提供了合法的 Bearer Token 时，解析为用户上下文', () => {
    const setHeader = vi.fn();
    const req = {
      headers: { authorization: 'Bearer test-jwt-token' },
    } as unknown as Request;
    const res = { setHeader } as unknown as Response;

    const mockVerifier = vi.fn().mockReturnValue({
      sub: 'usr-123',
      email: 'user@example.com',
      role: 'member',
      iat: 1000,
      exp: 2000,
    });

    const ctx = resolveAuthContext(req, res, mockVerifier);
    expect(ctx.actorType).toBe('user');
    expect(ctx.userId).toBe('usr-123');
    expect(ctx.email).toBe('user@example.com');
    expect(ctx.role).toBe('member');
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('Token 无效或校验抛错时，安全降级为访客身份', () => {
    const setHeader = vi.fn();
    const req = {
      headers: { authorization: 'Bearer invalid-token' },
    } as unknown as Request;
    const res = { setHeader } as unknown as Response;

    const mockVerifier = vi.fn().mockImplementation(() => {
      throw new Error('invalid token');
    });

    const ctx = resolveAuthContext(req, res, mockVerifier);
    expect(ctx.actorType).toBe('guest');
    expect(ctx.anonId).toBeTruthy();
    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('walker-anon='));
  });
});
