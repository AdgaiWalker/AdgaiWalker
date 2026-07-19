import { expect, test, type Page } from 'playwright/test';

async function loginAsOwner(page: Page): Promise<void> {
  await page.goto('/');
  const ok = await page.evaluate(async () => (await fetch('/api/auth/dev-preview', { method: 'POST' })).ok);
  expect(ok).toBe(true);
}

async function gotoAdmin(page: Page, route: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      return;
    } catch (error) {
      if (attempt === 1 || !String(error).includes('ERR_ABORTED')) throw error;
    }
  }
}
const ROUTES = [
  '/admin',
  '/admin/accounts',
  '/admin/review',
  '/admin/hit-rate',
  '/admin/content',
  '/admin/content/edit',
  '/admin/experiences',
  '/admin/rules',
  '/admin/skills',
  '/admin/assets',
  '/admin/ai-gateway',
  '/admin/grants',
  '/admin/invite-codes',
  '/admin/incidents',
  '/admin/appearance',
  '/admin/northstar',
] as const;

test.describe('后台共享骨架', () => {
  test.beforeEach(async ({ page }) => loginAsOwner(page));

  test('全部业务页使用同一套一级与二级导航', async ({ page }) => {
    for (const route of ROUTES) {
      await gotoAdmin(page, route);
      await expect(page.locator('.adm-primary-rail'), route).toBeVisible();
      await expect(page.locator('.adm-context-sidebar'), route).toBeVisible();
      await expect(page.locator('.adm-topbar-title, .workbench-head h1'), route).toHaveCount(1);
      await expect(page.locator('.admin-bar'), `${route} 不应残留旧横栏`).toHaveCount(0);
    }
  });

  test('窄屏使用底部一级导航，页面不产生横向滚动', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/review');
    await expect(page.locator('.adm-primary-rail')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
  test('洞察页不展示无来源指标，缺少遥测时明确标记未采集', async ({ page }) => {
    await page.goto('/admin/insights');
    await expect(page.getByText('未采集', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('流失 61%↑ · 本周最该修')).toHaveCount(0);
    await expect(page.getByText('自媒体公众号')).toHaveCount(0);
  });
});
