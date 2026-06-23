import { test } from 'playwright/test';
import * as path from 'path';

const ARTIFACT_DIR = 'C:/Users/26296/.gemini/antigravity/brain/d8804c42-0f81-459c-a4c9-b375c6a00605';

test('capture screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  // 1. Posts
  console.log('Navigating to /posts...');
  await page.goto('/posts', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01-posts.png') });
  console.log('Saved 01-posts.png');

  // 2. Ideas
  console.log('Navigating to /ideas...');
  await page.goto('/ideas', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '02-ideas.png') });
  console.log('Saved 02-ideas.png');

  // 3. Card Table Detail
  console.log('Navigating to /posts/卡牌桌...');
  await page.goto('/posts/卡牌桌', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03-detail-card-table.png') });
  console.log('Saved 03-detail-card-table.png');

  // 4. CLI Panel Detail
  console.log('Navigating to /posts/cli命令面板...');
  await page.goto('/posts/cli命令面板', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '04-detail-cli-panel.png') });
  console.log('Saved 04-detail-cli-panel.png');

  // 5. Open Collaborate Modal
  console.log('Attempting to open modal...');
  const joinBtn = page.locator('#collab-join-btn');
  if (await joinBtn.isVisible()) {
    await joinBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '05-detail-cli-panel-modal.png') });
    console.log('Saved 05-detail-cli-panel-modal.png');
  } else {
    console.log('Warning: join button not visible');
  }
});
