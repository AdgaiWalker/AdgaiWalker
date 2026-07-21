import { describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard';
import type { AppConfigPort } from '../config/config.port';

function config(token: string | undefined): AppConfigPort {
  return {
    getDatabaseUrl: () => undefined,
    isAiEnabled: () => false,
    getPort: () => 8788,
    getNodeEnv: () => 'test',
    getAdminApiToken: () => token,
  };
}

function ctx(authHeader?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) =>
          name.toLowerCase() === 'authorization' ? authHeader : undefined,
      }),
    }),
  } as never;
}

describe('AdminAuthGuard', () => {
  it('未配置令牌时拒绝（fail-closed）', () => {
    const guard = new AdminAuthGuard(config(undefined));
    expect(() => guard.canActivate(ctx('Bearer anything-long-enough'))).toThrow(
      UnauthorizedException,
    );
  });

  it('令牌过短时拒绝', () => {
    const guard = new AdminAuthGuard(config('short'));
    expect(() => guard.canActivate(ctx('Bearer short'))).toThrow(
      UnauthorizedException,
    );
  });

  it('Bearer 正确时通过', () => {
    const token = 'test-admin-token-16+';
    const guard = new AdminAuthGuard(config(token));
    expect(guard.canActivate(ctx(`Bearer ${token}`))).toBe(true);
  });

  it('Bearer 错误时拒绝', () => {
    const guard = new AdminAuthGuard(config('test-admin-token-16+'));
    expect(() =>
      guard.canActivate(ctx('Bearer wrong-admin-token-16+')),
    ).toThrow(UnauthorizedException);
  });
});
