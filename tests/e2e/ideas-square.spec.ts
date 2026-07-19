import { test, expect } from 'playwright/test';

test.describe('点子广场 E2E 交互测试', () => {
  test('应当能加载卡牌桌、触发翻转并进行反应点赞', async ({ page }) => {
    // 1. 访问广场页
    await page.goto('/ideas');
    await expect(page.locator('h1')).toContainText('点子');

    // 找到一个可见的 card container 并翻转
    const firstCard = page.locator('.card-container:not([hidden])').first();
    await expect(firstCard).toBeVisible();
    
    // 点击卡牌边缘触发翻转 (或翻牌按钮)
    await firstCard.locator('.flip-btn-action').first().click();
    await page.waitForTimeout(800);
    await expect(firstCard).toHaveClass(/is-flipped/);

    // 2. 点击反应按钮“我需要”
    const needBtn = firstCard.locator('[data-reaction-type="need"]');
    const initialText = await needBtn.locator('.reaction-count').textContent();
    const initialCount = parseInt(initialText || '0', 10);

    await needBtn.click();
    
    // 验证数值递增
    await expect(needBtn.locator('.reaction-count')).toHaveText((initialCount + 1).toString());
  });

  test('应当能打开“我能帮”表单并成功提交', async ({ page }) => {
    await page.goto('/ideas');
    const firstCard = page.locator('.card-container:not([hidden])').first();
    await firstCard.locator('.flip-btn-action').first().click();
    
    // 等待 3D 翻转动画 (0.6s) 彻底结束并稳定，确保点击事件能被稳定捕获
    await page.waitForTimeout(800);

    // 点击“我能帮”
    const helpBtn = firstCard.locator('.help-btn-trigger');
    await helpBtn.click();

    // 确认表单遮罩展现
    const overlay = firstCard.locator('[data-help-overlay]');
    await expect(overlay).toBeVisible();

    // 填写表单
    await overlay.locator('input[name="name"]').fill('E2E Test User');
    await overlay.locator('input[name="email"]').fill('e2e@example.com');
    await overlay.locator('select[name="helpType"]').selectOption('tech');
    await overlay.locator('textarea[name="note"]').fill('E2E test helper interest note');

    // 提交
    await overlay.locator('button[type="submit"]').click();

    // 确认遮罩最终关闭
    await expect(overlay).toBeHidden();
  });
});
