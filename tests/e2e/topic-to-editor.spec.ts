import { expect, test, type Page } from 'playwright/test';

/**
 * P1-F UI：从 Topic → 内容编辑器跳转，预填 sourceTopicId
 *
 * 验证：
 *  1. 选题卡片有"写内容"入口（无 producedContentSlug）/"改内容"入口（有 producedContentSlug）
 *  2. 点击"写内容"跳转到 /admin/content/edit?topicId=...&prefill=brief
 *  3. 编辑器预填的 draftTemplate frontmatter 含 sourceTopicId
 *  4. 从简报页"去编辑器创作"同样跳转并预填
 *
 * 安全：用本地 content store；afterAll 清理测试选题与可能误创建的内容文件。
 */

const TEST_RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const TEST_TOPIC_TITLE = `P1-F-UI 测试选题 ${TEST_RUN_ID}（勿保留）`;
const TEST_SLUG = `p1f-ui-test-${TEST_RUN_ID}`;

async function loginAsOwner(page: Page): Promise<void> {
  await page.goto('/');
  const ok = await page.evaluate(async () => {
    const res = await fetch('/api/auth/dev-preview', { method: 'POST' });
    return res.ok;
  });
  expect(ok).toBe(true);
}

async function apiCall(page: Page, method: string, path: string, body?: unknown) {
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

test.describe.serial('P1-F UI：Topic → 编辑器跳转与 sourceTopicId 预填', () => {
  let testTopicId: string;
  let ownerPage: Page;

  test.beforeAll(async ({ browser }) => {
    ownerPage = await browser.newPage();
    await loginAsOwner(ownerPage);
    const res = await apiCall(ownerPage, 'POST', '/api/admin/inspiration', { text: TEST_TOPIC_TITLE });
    expect(res.body.ok).toBe(true);
    testTopicId = res.body.topicId;
  });

  test.afterAll(async () => {
    if (ownerPage) {
      await apiCall(ownerPage, 'DELETE', `/api/admin/content/${TEST_SLUG}`).catch(() => {});
      await ownerPage.close();
    }
  });

  test('选题卡片有"写内容"入口，跳转到编辑器并预填 sourceTopicId', async () => {
    // 选题页（observed 状态）应显示"写内容"按钮，href 含 topicId + prefill=brief
    await ownerPage.goto('/admin/topics');
    // 找到测试选题卡片
    const card = ownerPage.locator(`.topic-card[data-topic-id="${testTopicId}"]`);
    await expect(card).toBeVisible();
    const writeLink = card.locator('a.topic-btn', { hasText: '写内容' });
    await expect(writeLink).toBeVisible();
    const href = await writeLink.first().getAttribute('href');
    expect(href).toContain(`/admin/content/edit?topicId=${testTopicId}`);
    expect(href).toContain('prefill=brief');

    // 点击跳转
    await writeLink.click();
    await expect(ownerPage).toHaveURL(/\/admin\/content\/edit\?topicId=/);
    // 编辑器 textarea 预填的 draftTemplate 含 sourceTopicId（异步加载，等待出现）
    const editor = ownerPage.locator('#ie-editor');
    await expect(editor).toBeVisible();
    await expect.poll(async () => editor.inputValue(), { timeout: 8000 })
      .toContain(`sourceTopicId: "${testTopicId}"`);
    // 含简报参考结构（证明 prefill=brief 通道生效）。简报分段异步加载，poll 等待"建议角度"出现。
    await expect.poll(async () => editor.inputValue(), { timeout: 8000 }).toContain('建议角度');
  });

  test('选题页使用统一后台骨架，不再保留独立旧导航', async () => {
    await ownerPage.goto('/admin/topics');
    await expect(ownerPage.locator('.adm-root')).toBeVisible();
    await expect(ownerPage.locator('.admin-bar')).toHaveCount(0);
    await expect(ownerPage.locator('[data-admin-primary="creation"]')).toBeVisible();
  });

  test('暂缓选题使用界面内表单，不调用浏览器原生弹窗', async () => {
    await ownerPage.goto('/admin/topics');
    await expect(ownerPage.locator('[data-topic-action-dialog]')).toBeAttached();
    const clientScripts = (await ownerPage.locator('script').allTextContents()).join('\n');
    expect(clientScripts).not.toContain('window.prompt');
    expect(clientScripts).not.toContain('window.alert');
  });

  test('简报页"去编辑器创作"同样跳转并预填 sourceTopicId', async () => {
    await ownerPage.goto(`/admin/brief?topicId=${testTopicId}`);
    await expect(ownerPage.locator('.brief-title')).toContainText(TEST_TOPIC_TITLE);
    const goBtn = ownerPage.locator('a.brief-btn-primary', { hasText: '去编辑器创作' });
    await expect(goBtn).toBeVisible();
    const href = await goBtn.getAttribute('href');
    expect(href).toContain(`topicId=${testTopicId}`);
    expect(href).toContain('prefill=brief');

    await goBtn.click();
    await expect(ownerPage).toHaveURL(/\/admin\/content\/edit\?topicId=/);
    const editor = ownerPage.locator('#ie-editor');
    await expect.poll(async () => editor.inputValue(), { timeout: 8000 })
      .toContain(`sourceTopicId: "${testTopicId}"`);
  });

  test('选题产出内容后，卡片入口变为"改内容"并指向已有 slug', async () => {
    // 先给选题创建一个 producedContentSlug（模拟已产出）
    await apiCall(ownerPage, 'POST', '/api/insights', {
      topicId: testTopicId,
      status: 'produced',
      producedContentSlug: TEST_SLUG,
    });

    await ownerPage.goto('/admin/topics');
    // 切换到"已创作"面板（非首屏 tab，需点击激活）
    await ownerPage.locator('.tab-btn[data-tab="produced"]').click();
    const producedPanel = ownerPage.locator('[data-panel="produced"]');
    await expect(producedPanel).toHaveClass(/active/);
    const card = producedPanel.locator(`.topic-card[data-topic-id="${testTopicId}"]`);
    await expect(card).toBeVisible();
    const editLink = card.locator('a.topic-btn', { hasText: '改内容' });
    await expect(editLink).toBeVisible();
    const href = await editLink.getAttribute('href');
    expect(href).toContain(`slug=${TEST_SLUG}`);
    expect(href).toContain(`topicId=${testTopicId}`);
  });
});
