/**
 * POST /api/auth/setup — owner 账号一次性 bootstrap 端点测试（P0-3）
 *
 * setup.ts 在模块级实例化 accountService（const accountService = createAccountService()），
 * 该语句在 `import { POST } from './setup'` 解析时即执行，早于测试文件体里的
 * `const bootstrapOwner = vi.fn()`。因此用 vi.hoisted 把 bootstrapOwner 提到
 * 导入解析之前绑定，避免 TDZ / undefined。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { bootstrapOwner } = vi.hoisted(() => ({ bootstrapOwner: vi.fn() }));

vi.mock('@/services/account.service', () => ({
  createAccountService: () => ({ bootstrapOwner }),
}));

import { POST } from './setup';

// signSessionToken 需要 COOKIE_SECRET；setup.ts 在 handler 内读取（非模块级），
// 在测试体执行前注入即可。
const env = import.meta.env as Record<string, unknown>;
env.COOKIE_SECRET = 'test-secret';

/* eslint-disable @typescript-eslint/no-explicit-any */
function callSetup() {
  const request = new Request('http://localhost/api/auth/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ adminPassword: 'x', ownerUsername: 'w', ownerPassword: 'p' }),
  });
  return POST({ request, url: new URL('http://localhost/api/auth/setup') } as any);
}

describe('POST /api/auth/setup（P0-3）', () => {
  beforeEach(() => {
    bootstrapOwner.mockReset();
  });

  it('系统已有账号（bootstrap-locked）→ 返回 410', async () => {
    bootstrapOwner.mockResolvedValue({ ok: false, code: 'bootstrap-locked', reason: '已锁定' });
    const res = await callSetup();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it('成功 bootstrap → 返回 200 + Set-Cookie', async () => {
    bootstrapOwner.mockResolvedValue({ ok: true, sessionId: 's1', role: 'owner', username: 'walker' });
    const res = await callSetup();
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
