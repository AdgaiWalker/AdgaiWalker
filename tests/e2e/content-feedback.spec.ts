import { expect, test, type Page } from 'playwright/test';

/**
 * 内容反馈 E2E（P1-B03）
 *
 * 极简反馈即时化适配：
 * - 覆盖：打开文章 → 提交 useful 即时反馈 → 提交 needs-more + note 抽屉展开与提交 → 503 报错保留输入。
 */

const FIXED_POST = '/posts/side-hustle-blueprint';
const CONTENT_ID = 'side-hustle-blueprint';

async function loginAsOwner(page: Page): Promise<void> {
  await page.goto('/');
  const ok = await page.evaluate(async () => {
    const res = await fetch('/api/auth/dev-preview', { method: 'POST' });
    return res.ok;
  });
  expect(ok).toBe(true);
}

async function openFeedbackFresh(page: Page): Promise<void> {
  await page.addInitScript((id) => {
    try { localStorage.removeItem(`walker-feedback-done:${id}`); } catch { /* ignore */ }
  }, CONTENT_ID);
  await page.goto(FIXED_POST);
  await expect(page.locator('[data-block-feedback]')).toBeVisible();
}

test('提交 useful 反馈后显示已收到', async ({ page }) => {
  await openFeedbackFresh(page);
  const feedback = page.locator('[data-block-feedback]');

  await feedback.locator('[data-signal="useful"]').click();

  await expect(feedback.locator('[data-bf-success]')).toBeVisible();
  await expect(feedback.locator('[data-bf-success]')).toContainText('已收到');
});

test('提交 needs-more 带说明，note 框在选 needs-more 后展开', async ({ page }) => {
  await openFeedbackFresh(page);
  const feedback = page.locator('[data-block-feedback]');
  const drawer = feedback.locator('[data-bf-note-drawer]');
  
  // 初始 note 框隐藏
  await expect(drawer).toBeHidden();
  // 选 needs-more 后展开
  await feedback.locator('[data-signal="needs-more"]').click();
  await expect(drawer).toBeVisible();
  
  await feedback.locator('[data-bf-note]').fill('缺少一个具体的例子');
  await feedback.locator('[data-bf-note-submit]').click();

  await expect(feedback.locator('[data-bf-success]')).toBeVisible();
});

test('API 失败时保留表单与已填内容，可重试', async ({ page }) => {
  await openFeedbackFresh(page);

  // 拦截 content-feedback 接口，强制返回 503
  await page.route('**/api/content-feedback', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '存储不可用' }) }),
  );

  const feedback = page.locator('[data-block-feedback]');
  await feedback.locator('[data-signal="outdated"]').click();
  
  const input = feedback.locator('[data-bf-note]');
  await input.fill('链接已失效');
  await feedback.locator('[data-bf-note-submit]').click();

  // 失败时状态显示错误，且保留原有状态
  await expect(feedback.locator('[data-bf-status]')).toContainText('提交失败');
  await expect(feedback.locator('[data-signal="outdated"]')).toHaveClass(/active/);
  await expect(input).toHaveValue('链接已失效');
});

test('键盘可完成整个反馈流程', async ({ page }) => {
  await openFeedbackFresh(page);
  const feedback = page.locator('[data-block-feedback]');
  
  // 用键盘聚焦 useful 按钮并回车
  await feedback.locator('[data-signal="useful"]').focus();
  await page.keyboard.press('Enter');
  
  await expect(feedback.locator('[data-bf-success]')).toBeVisible({ timeout: 15_000 });
});

test('手机宽度反馈区无水平溢出', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openFeedbackFresh(page);

  const feedback = page.locator('[data-block-feedback]');
  await expect(feedback).toBeVisible();
  const box = await feedback.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375 + 1); // 允许 1px 容差
});

test('后台命中率可打开原始反馈列表，说明默认已脱敏', async ({ page }) => {
  const submitted = await page.request.post('/api/content-feedback', {
    headers: { 'x-forwarded-for': `203.0.113.${Date.now() % 250}` },
    data: {
      contentId: CONTENT_ID,
      signal: 'needs-more',
      note: '请补一个例子，我的邮箱是 walker-admin@example.com',
      consentForAnalysis: true,
    },
  });
  expect(submitted.status()).toBe(201);

  await loginAsOwner(page);
  await page.goto('/admin/hit-rate?view=outcome');
  const details = page.locator(`[data-feedback-details="${CONTENT_ID}"]`).first();
  await expect(details).toBeVisible();
  await details.locator('summary').click();
  
  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('.feedback-privacy')).toBeVisible();
  await expect(details).toContainText('[邮箱已隐藏]');
  await expect(details).not.toContainText('walker-admin@example.com');
});
