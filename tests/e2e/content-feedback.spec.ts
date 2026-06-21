import { expect, test, type Page } from 'playwright/test';

/**
 * 内容反馈 E2E（P1-B03）
 *
 * 覆盖：打开真实文章 → 提交 useful → 提交 needs-more + note → 模拟 API 503 后保留表单 → 键盘完成 → 手机宽度无溢出。
 * 前置：需要 dev server（playwright.config.ts 自动起）+ 至少一篇公开文章。
 *
 * 注意：radio input 视觉隐藏（opacity:0），用 label click 触发；
 *       DONE 防重复标记在脚本加载时读取，需在 goto 前清掉再 reload。
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
  // 先清 localStorage 再导航，避免上一次测试的 DONE 标记隐藏表单
  await page.addInitScript((id) => {
    try { localStorage.removeItem(`walker-feedback-done:${id}`); } catch { /* ignore */ }
  }, CONTENT_ID);
  await page.goto(FIXED_POST);
  await expect(page.locator('[data-block-feedback]')).toBeVisible();
}

test('提交 useful 反馈后显示已收到', async ({ page }) => {
  await openFeedbackFresh(page);
  const feedback = page.locator('[data-block-feedback]');

  await feedback.locator('label.bf-option:has(input[value="useful"])').click();
  await expect(feedback.locator('[data-bf-submit]')).toBeEnabled();
  await feedback.locator('[data-bf-submit]').click();

  await expect(feedback.locator('[data-bf-done]')).toBeVisible();
  await expect(feedback.locator('[data-bf-done]')).toContainText('已收到');
});

test('提交 needs-more 带说明，note 框在选 needs-more 后展开', async ({ page }) => {
  await openFeedbackFresh(page);
  const feedback = page.locator('[data-block-feedback]');
  // 初始 note 框隐藏
  await expect(feedback.locator('[data-bf-note-wrap]')).toBeHidden();
  // 选 needs-more 后展开
  await feedback.locator('label.bf-option:has(input[value="needs-more"])').click();
  await expect(feedback.locator('[data-bf-note-wrap]')).toBeVisible();
  await feedback.locator('[data-bf-note]').fill('缺少一个具体的例子');
  await feedback.locator('[data-bf-submit]').click();

  await expect(feedback.locator('[data-bf-done]')).toBeVisible();
});

test('API 失败时保留表单与已填内容，可重试', async ({ page }) => {
  await openFeedbackFresh(page);

  // 拦截 content-feedback 接口，强制返回 503
  await page.route('**/api/content-feedback', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '存储不可用' }) }),
  );

  const feedback = page.locator('[data-block-feedback]');
  await feedback.locator('label.bf-option:has(input[value="outdated"])').click();
  await feedback.locator('[data-bf-note]').fill('链接已失效');
  await feedback.locator('[data-bf-submit]').click();

  // 失败时状态显示错误，表单与已填内容保留
  await expect(feedback.locator('[data-bf-status]')).toContainText('提交失败');
  await expect(feedback.locator('input[value="outdated"]')).toBeChecked();
  await expect(feedback.locator('[data-bf-note]')).toHaveValue('链接已失效');
  await expect(feedback.locator('[data-bf-submit]')).toBeEnabled();
});

test('键盘可完成整个反馈流程', async ({ page }) => {
  await openFeedbackFresh(page);
  const feedback = page.locator('[data-block-feedback]');
  // 用键盘聚焦 useful 选项并选中
  await feedback.locator('input[value="useful"]').focus();
  await page.keyboard.press('Space');
  await expect(feedback.locator('[data-bf-submit]')).toBeEnabled();
  // 用键盘提交
  await feedback.locator('[data-bf-submit]').focus();
  await page.keyboard.press('Enter');
  await expect(feedback.locator('[data-bf-done]')).toBeVisible();
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
  await expect(details).toContainText('仅显示服务端已脱敏后的反馈说明');
  await expect(details).toContainText('[邮箱已隐藏]');
  await expect(details).not.toContainText('walker-admin@example.com');
});
