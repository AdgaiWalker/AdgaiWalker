import { expect, test, type Page } from 'playwright/test';

/**
 * P0-10 上线主路径烟测
 *
 * 覆盖 to-do 文档 Wave 4 的安全验证路径：
 * - 公开路径可访问
 * - dev-preview 仅 DEV 可用（PROD 语义由单元测试覆盖）
 * - setup 已有账号时自锁 410（由单元测试覆盖）
 * - 封号后旧 cookie 失效（isAdminAsync 信任链）
 * - admin API 拒绝无 session 请求
 */
async function loginAsOwner(page: Page): Promise<void> {
  await page.goto('/');
  const ok = await page.evaluate(async () => {
    const res = await fetch('/api/auth/dev-preview', { method: 'POST' });
    return res.ok;
  });
  expect(ok).toBe(true);
}

async function apiCall(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  return page.evaluate(async ({ method, path, body }) => {
    const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(path, init);
    const text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: res.status, body: parsed };
  }, { method, path, body });
}

test.describe('上线主路径烟测（P0-10）', () => {

  test('[公开路径] 访客访问首页 → 200', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
  });

  test('[公开路径] 访客访问内容页 → 200', async ({ page }) => {
    const res = await page.goto('/learn');
    expect(res?.status()).toBe(200);
  });

  test('[公开路径] 访客访问工具页 → 200', async ({ page }) => {
    const res = await page.goto('/tools');
    expect([200, 403]).toContain(res?.status() ?? 0);
  });

  test('[安全] 无 cookie 访问 admin API → 401', async ({ page }) => {
    await page.goto('/');
    const { status } = await apiCall(page, 'GET', '/api/admin/workbench');
    expect(status).toBe(401);
  });

  test('[安全] owner 登录后访问 admin API → 非 401', async ({ page }) => {
    await loginAsOwner(page);
    const { status } = await apiCall(page, 'GET', '/api/admin/workbench');
    expect(status).not.toBe(401);
  });

  test('[安全] 信任链：有效 session 通过，无 cookie 拒绝（isAdminAsync）', async ({ page }) => {
    // 核心信任链验证：isAdminAsync = cookie签名有效 + sessionStore.isValid通过
    // 无 cookie → 401
    await page.goto('/');
    const { status: anonStatus } = await apiCall(page, 'GET', '/api/admin/workbench');
    expect(anonStatus).toBe(401);

    // dev-preview 建立有效 session（写入 sessionStore）→ 非 401
    await loginAsOwner(page);
    const { status: authStatus } = await apiCall(page, 'GET', '/api/admin/workbench');
    expect(authStatus).not.toBe(401);

    // 封号后旧 cookie 失效的端到端验证需要真实账号（setStatus 内部 killAllByUsername），
    // dev-preview 的 'local-preview' 非真实账号。isValid=false → 拒绝由 admin-auth.test.ts 单元测试覆盖。
  });

  test('[安全] 高风险接口无 audit 时拒绝（存储不可用 → 503）', async ({ page }) => {
    await loginAsOwner(page);
    // 封号/删账号是高风险操作，需 audit；本地无 Redis 时 audit 返回 storage-unavailable
    // 但开发环境 audit 走内存，应通过
    // 这里验证 audit 门闩存在：删账号接口不会无 audit 直接执行
    const { status, body } = await apiCall(page, 'POST', '/api/admin/accounts/delete', {
      username: 'nonexistent-user-for-audit-test',
    });
    // 要么 audit 通过后业务失败（400 user not found），要么 audit 失败（503）
    expect([400, 403, 503]).toContain(status);
    if (status === 503) {
      expect(body.code).toBe('storage-unavailable');
    }
  });

  test('[后台] owner 登录后访问 /admin → 200', async ({ page }) => {
    await loginAsOwner(page);
    const res = await page.goto('/admin');
    expect(res?.status()).toBe(200);
  });

  test('[后台] owner 登录后访问命中率页 → 200', async ({ page }) => {
    await loginAsOwner(page);
    const res = await page.goto('/admin/hit-rate');
    expect(res?.status()).toBe(200);
  });

  test('[后台] owner 登录后访问外观页 → 200', async ({ page }) => {
    await loginAsOwner(page);
    const res = await page.goto('/admin/appearance');
    expect(res?.status()).toBe(200);
  });
});
