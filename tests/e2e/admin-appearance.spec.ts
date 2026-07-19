import { expect, test, type Page } from 'playwright/test';

async function loginAsOwner(page: Page): Promise<void> {
  await page.goto('/');
  const ok = await page.evaluate(async () => {
    const res = await fetch('/api/auth/dev-preview', { method: 'POST' });
    return res.ok;
  });
  expect(ok).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await loginAsOwner(page);
});

test('外观与媒体页可保存主题、保护可读性并恢复默认', async ({ page }) => {
  await page.goto('/admin/appearance');
  await expect(page.getByRole('heading', { name: 'Apple 现代玻璃 · Walker 翡翠青' })).toBeVisible();
  await expect(page.getByText('外观变化不改变事实、优先级和业务状态')).toBeVisible();
  await expect(page.getByText('媒体存储：开发本地文件')).toBeVisible();
  await expect(page.getByRole('button', { name: '上传到媒体库' })).toBeEnabled();

  await page.getByLabel('主题名称').fill('E2E 主题');
  await page.getByLabel('强调色').selectOption('mint');
  await page.getByLabel(/可读性遮罩/).fill('82');
  await page.getByRole('button', { name: '保存外观' }).click();
  await expect(page.locator('[data-theme-status]')).toContainText('外观已保存');

  const state = await page.evaluate(async () => {
    const res = await fetch('/api/admin/appearance');
    return res.json();
  });
  expect(state.theme.name).toBe('E2E 主题');
  expect(state.theme.accent).toBe('mint');
  expect(state.theme.readabilityOverlay).toBe(0.82);

  await page.getByRole('button', { name: '恢复默认' }).click();
  await expect(page.locator('[data-theme-status]')).toContainText('已恢复默认主题');
});

test('外观 API 拒绝超大或不支持媒体，未登录不可读', async ({ page, browser }) => {
  const unsupported = await page.evaluate(async () => {
    const form = new FormData();
    form.set('file', new File(['x'], 'x.txt', { type: 'text/plain' }));
    const res = await fetch('/api/admin/appearance', {
      method: 'POST',
      body: form,
    });
    return { status: res.status, body: await res.json() };
  });
  expect(unsupported.status).toBe(415);

  const tooLarge = await page.evaluate(async () => {
    const form = new FormData();
    form.set('file', new File([new Uint8Array(21 * 1024 * 1024)], 'big.png', { type: 'image/png' }));
    const res = await fetch('/api/admin/appearance', {
      method: 'POST',
      body: form,
    });
    return { status: res.status, body: await res.json() };
  });
  expect(tooLarge.status).toBe(413);

  const ctx = await browser.newContext();
  const anon = await ctx.newPage();
  await anon.goto('/');
  const status = await anon.evaluate(async () => (await fetch('/api/admin/appearance')).status);
  expect(status).toBe(401);
  await ctx.close();
});

test('上传媒体后只能由后台登录态读取文件本体', async ({ page, browser }) => {
  const uploaded = await page.evaluate(async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const form = new FormData();
    form.set('file', new File([bytes], 'probe.png', { type: 'image/png' }));
    const res = await fetch('/api/admin/appearance', { method: 'POST', body: form });
    return { status: res.status, body: await res.json() };
  });
  expect(uploaded.status).toBe(201);
  const media = uploaded.body.media as { assetId: string; publicUrl: string };
  expect(media.publicUrl).toContain('/api/admin/appearance/media?assetId=');

  const read = await page.evaluate(async publicUrl => {
    const res = await fetch(publicUrl);
    return {
      status: res.status,
      contentType: res.headers.get('content-type'),
      bytes: Array.from(new Uint8Array(await res.arrayBuffer())),
    };
  }, media.publicUrl);
  expect(read.status).toBe(200);
  expect(read.contentType).toContain('image/png');
  expect(read.bytes.slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

  const ctx = await browser.newContext();
  const anon = await ctx.newPage();
  await anon.goto('/');
  const anonStatus = await anon.evaluate(async publicUrl => (await fetch(publicUrl)).status, media.publicUrl);
  expect(anonStatus).toBe(401);
  await ctx.close();

  const removed = await page.evaluate(async assetId => (await fetch(`/api/admin/appearance?assetId=${encodeURIComponent(assetId)}`, { method: 'DELETE' })).status, media.assetId);
  expect(removed).toBe(200);
  const readAfterDelete = await page.evaluate(async publicUrl => (await fetch(publicUrl)).status, media.publicUrl);
  expect(readAfterDelete).toBe(404);
});
