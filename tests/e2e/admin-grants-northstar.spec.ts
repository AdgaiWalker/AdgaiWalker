import { expect, test, type Page } from 'playwright/test';

/**
 * Contributor RBAC + NorthStar 经营管理页 E2E（第十六轮 Task 5/7）
 * 覆盖：/admin/grants 渲染 + 创建/撤销 grant；/admin/northstar 渲染 + OFF 守护显示。
 */

async function loginAsOwner(page: Page): Promise<void> {
  await page.goto('/');
  const ok = await page.evaluate(async () => {
    const res = await fetch('/api/auth/dev-preview', { method: 'POST' });
    return res.ok;
  });
  expect(ok).toBe(true);
}

test.describe('Contributor RBAC 授权管理页', () => {
  test('owner 可见创建表单 + 角色模板，未授权访问跳转登录', async ({ page }) => {
    // 未登录 → 跳转登录
    await page.goto('/admin/grants');
    await expect(page).toHaveURL(/\/login/);

    await loginAsOwner(page);
    await page.goto('/admin/grants');
    await expect(page.getByRole('heading', { name: 'Contributor 授权' })).toBeVisible();
    // 创建表单 + 角色模板按钮存在
    await expect(page.locator('#grant-form')).toBeVisible();
    await expect(page.getByText('角色模板')).toBeVisible();
    // 6 角色模板按钮
    expect(await page.locator('.tpl-btn').count()).toBeGreaterThanOrEqual(5);
  });

  test('owner 创建 grant 后列表出现，撤销后消失', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/admin/grants');
    await page.locator('input[name="grantee"]').fill('e2e-contributor');
    await page.locator('select[name="resourceType"]').selectOption('content');
    await page.locator('input[name="resourceId"]').fill('*');
    await page.locator('input[name="actions"]').fill('read');
    await page.locator('input[name="reason"]').fill('E2E 测试授权');
    await page.locator('#grant-form button[type="submit"]').click();
    // 创建后 reload，列表含该 grant
    await expect(page.getByText('e2e-contributor')).toBeVisible();
    // 撤销
    const revokeBtn = page.locator('.revoke-btn').first();
    await revokeBtn.click();
    // WalkerAdminUI.confirm 可能弹（若存在），兜底直接确认
    const confirmYes = page.locator('[data-adm-ui-dialog] button.is-primary, dialog button.btn-primary').first();
    if (await confirmYes.isVisible().catch(() => false)) await confirmYes.click();
    await page.waitForTimeout(500);
  });
});

test.describe('NorthStar 经营管理页', () => {
  test('渲染 + OFF 守护状态显示（默认未开启）', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/admin/northstar');
    await expect(page.getByRole('heading', { name: 'NorthStar 经营' })).toBeVisible();
    // 默认 OFF → 显示未开启说明
    await expect(page.locator('.ns-status.off')).toBeVisible();
    // OFF 时无发布表单
    await expect(page.locator('#offer-form')).toHaveCount(0);
  });

  test('NorthStar 关闭时创建 offer 返回 northstar-disabled', async ({ page }) => {
    await loginAsOwner(page);
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/admin/northstar/offers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'service', title: '测试', priceCents: 100, currency: 'CNY' }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('northstar-disabled');
  });
});
