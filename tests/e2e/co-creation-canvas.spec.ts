import { test, expect } from 'playwright/test';
import * as path from 'path';

const ARTIFACT_DIR = 'C:/Users/26296/.gemini/antigravity/brain/d8804c42-0f81-459c-a4c9-b375c6a00605';

test('co-creation canvas flow and autosave', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  // 1. Navigate to details page
  console.log('Navigating to /posts/cli命令面板...');
  await page.goto('/posts/cli%E5%91%BD%E4%BB%A4%E9%9D%A2%E6%9D%BF', { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  // 2. Open collaborate modal
  const joinBtn = page.locator('#collab-join-btn');
  await expect(joinBtn).toBeVisible();
  await joinBtn.click();
  await page.waitForTimeout(500);

  // 3. Verify link button exists and points to canvas page
  const canvasLink = page.locator('#collab-canvas-link-btn');
  await expect(canvasLink).toBeVisible();
  await expect(canvasLink).toHaveAttribute('href', '/posts/cli命令面板/canvas');

  // 4. Click link and navigate to canvas page
  await canvasLink.click();
  await page.waitForURL(/\/posts\/.*\/canvas$/, { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  // 5. Verify layout components
  const editor = page.locator('#markdown-editor');
  await expect(editor).toBeVisible();

  const boardPane = page.locator('.canvas-board-pane');
  await expect(boardPane).toBeVisible();

  const saveStatus = page.locator('#save-status');
  await expect(saveStatus).toContainText('已加载草稿');

  // 6. Enter some content in the editor to trigger autosave
  console.log('Typing on markdown editor...');
  await editor.focus();
  await page.keyboard.type('\n\n- E2E Co-creation entry test.');
  
  // Wait for typing debounce and API response
  await page.waitForTimeout(2500);

  // 7. Verify save status changed to "已自动保存"
  await expect(saveStatus).toContainText('已自动保存');

  // 8. Capture canvas screenshot
  console.log('Capturing co-creation canvas screenshot...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '06-canvas-split-screen.png') });
  console.log('Saved 06-canvas-split-screen.png');
});
