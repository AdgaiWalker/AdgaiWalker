import { afterEach, describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { AdminTokenMiddleware } from './admin-token.middleware';

const TOKEN = 'test-admin-token';

function mockRes(): {
  res: Response;
  state: { status: number; payload: unknown; headers: Record<string, string> };
} {
  const state = { status: 0, payload: null as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader: (k: string, v: string) => {
      state.headers[k] = v;
    },
    status: (code: number) => {
      state.status = code;
      return res;
    },
    json: (body: unknown) => {
      state.payload = body;
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

function mockReq(headers: Record<string, string>): Request {
  return { header: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}

function run(req: Request, res: Response): boolean {
  let nextCalled = false;
  new AdminTokenMiddleware().use(req, res, () => {
    nextCalled = true;
  });
  return nextCalled;
}

afterEach(() => {
  delete process.env.WALKER_ADMIN_TOKEN;
});

describe('AdminTokenMiddleware', () => {
  it('未配置 token 时放行（本地开发）', () => {
    const { res, state } = mockRes();
    expect(run(mockReq({}), res)).toBe(true);
    expect(state.status).toBe(0);
  });

  it('缺少凭据返回 401 并带 WWW-Authenticate', () => {
    process.env.WALKER_ADMIN_TOKEN = TOKEN;
    const { res, state } = mockRes();
    expect(run(mockReq({}), res)).toBe(false);
    expect(state.status).toBe(401);
    expect(state.payload).toMatchObject({ code: 'admin-auth-required' });
    expect(state.headers['WWW-Authenticate']).toContain('Basic');
  });

  it('正确的 x-admin-token 放行', () => {
    process.env.WALKER_ADMIN_TOKEN = TOKEN;
    const { res } = mockRes();
    expect(run(mockReq({ 'x-admin-token': TOKEN }), res)).toBe(true);
  });

  it('错误的 x-admin-token 拒绝', () => {
    process.env.WALKER_ADMIN_TOKEN = TOKEN;
    const { res, state } = mockRes();
    run(mockReq({ 'x-admin-token': 'wrong' }), res);
    expect(state.status).toBe(401);
  });

  it('Basic 凭据密码部分等于 token 时放行', () => {
    process.env.WALKER_ADMIN_TOKEN = TOKEN;
    const { res } = mockRes();
    const basic = `Basic ${Buffer.from(`walker:${TOKEN}`).toString('base64')}`;
    expect(run(mockReq({ authorization: basic }), res)).toBe(true);
  });

  it('Basic 凭据密码错误时拒绝', () => {
    process.env.WALKER_ADMIN_TOKEN = TOKEN;
    const { res, state } = mockRes();
    const basic = `Basic ${Buffer.from('walker:wrong').toString('base64')}`;
    run(mockReq({ authorization: basic }), res);
    expect(state.status).toBe(401);
  });

  it('畸形 Authorization 头不崩溃且拒绝', () => {
    process.env.WALKER_ADMIN_TOKEN = TOKEN;
    for (const header of ['Basic !!!not-base64!!!', 'Basic', 'Bearer xyz', 'Basic ' + Buffer.from('nocolon').toString('base64')]) {
      const { res, state } = mockRes();
      run(mockReq({ authorization: header }), res);
      expect(state.status).toBe(401);
    }
  });
});
