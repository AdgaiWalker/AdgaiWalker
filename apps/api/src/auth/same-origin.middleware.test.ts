import { afterEach, describe, expect, it } from 'vitest';
import { SameOriginMiddleware, allowedOriginHosts } from './same-origin.middleware';

function run(headers: Record<string, string>, method = 'POST') {
  const middleware = new SameOriginMiddleware();
  let status = 0;
  let passed = false;
  middleware.use(
    { headers, method } as never,
    { status(code: number) { status = code; return { json: () => undefined }; } } as never,
    () => { passed = true; },
  );
  return { status, passed };
}

describe('SameOriginMiddleware（公开写路由 CSRF 防线）', () => {
  afterEach(() => {
    delete process.env.WALKER_PUBLIC_ORIGINS;
  });

  it('无 Origin/Referer 放行；同源（host 相同）放行', () => {
    expect(run({ host: 'api.iwalk.pro' }).passed).toBe(true);
    expect(run({ host: 'api.iwalk.pro', origin: 'https://api.iwalk.pro' }).passed).toBe(true);
    expect(run({ host: '127.0.0.1:8788', referer: 'http://127.0.0.1:8788/post/a' }).passed).toBe(true);
  });

  it('跨站 Origin 一律 403；Origin 非法也 403', () => {
    const denied = run({ host: 'api.iwalk.pro', origin: 'https://evil.example.com' });
    expect(denied.passed).toBe(false);
    expect(denied.status).toBe(403);
    expect(run({ host: 'api.iwalk.pro', origin: 'not a url' }).status).toBe(403);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('变更方法 %s 都拒绝不受信任的来源', (method) => {
    expect(run({ host: 'api.iwalk.pro', origin: 'https://evil.example' }, method).status).toBe(403);
  });

  it('安全读取方法不由 CSRF 中间件拦截', () => {
    expect(run({ host: 'api.iwalk.pro', origin: 'https://evil.example' }, 'GET').passed).toBe(true);
  });

  it('白名单内的来源放行（WALKER_PUBLIC_ORIGINS）', () => {
    process.env.WALKER_PUBLIC_ORIGINS = 'www.iwalk.pro, staging.iwalk.pro';
    expect(allowedOriginHosts()).toEqual(['www.iwalk.pro', 'staging.iwalk.pro']);
    expect(run({ host: 'api.iwalk.pro', origin: 'https://www.iwalk.pro' }).passed).toBe(true);
    expect(run({ host: 'api.iwalk.pro', origin: 'https://other.iwalk.pro' }).status).toBe(403);
  });
});
