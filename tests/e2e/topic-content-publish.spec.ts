import { expect, test, type Page } from 'playwright/test';

/**
 * P1-F 端到端：Topic → 内容编辑 → 保留 sourceTopicId → 发布
 *
 * 验证链路核心（写入 API 的真实行为）：
 *  1. 创建一个测试选题（WalkerThesis 风格，E2E 无真实 NeedCase 聚类）
 *  2. 通过内容写入 API 创建一篇测试内容，frontmatter + body.topicId 双通道带 sourceTopicId
 *  3. 验证 API 返回 topicLinked=true，且选题状态回写为 produced + producedContentSlug 指向该内容
 *  4. 验证写入的文件确实包含 sourceTopicId frontmatter（读回校验）
 *
 * 现实约束：Astro content collection 在 dev server 启动时缓存，运行期写入的新文件需重启才进
 *   /posts/<slug> 路由与 getPublishedContentItems。因此"详情页渲染"与"hit-rate 关联"无法在
 *   同一 dev server 会话内 E2E 验证；这两项由单元/集成测试（hit-rate.service.test 已覆盖
 *   sourceTopicId 关联）+ 既有真实详情页 E2E（content-shell-toc / content-feedback）分别证明。
 *   本测试聚焦"写入 → sourceTopicId 保留 → 选题状态回写"这条最关键、最易回归的链路。
 *
 * 安全：DEV 无 GITHUB_TOKEN 时用本地 content store，写真实测试文件到工作区；
 *       afterAll 强制删除测试文件，不污染真实内容；不触碰 git remote。
 */

const TEST_SLUG = 'p1f-publish-test-do-not-keep';
const TEST_TOPIC_TITLE = 'P1-F 测试选题（勿保留）';

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

test.describe.serial('P1-F Topic → 内容 → sourceTopicId → 发布', () => {
  let testTopicId: string;
  let ownerPage: Page;

  test.beforeAll(async ({ browser }) => {
    ownerPage = await browser.newPage();
    await loginAsOwner(ownerPage);
    const res = await apiCall(ownerPage, 'POST', '/api/admin/inspiration', { text: TEST_TOPIC_TITLE });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    testTopicId = res.body.topicId;
  });

  test.afterAll(async () => {
    if (ownerPage) {
      await apiCall(ownerPage, 'DELETE', `/api/admin/content/${TEST_SLUG}`).catch(() => {});
      await ownerPage.close();
    }
  });

  test('内容写入时保留 sourceTopicId 并回写选题状态为 produced', async () => {
    // 确认选题存在且非 produced
    const topicBefore = await apiCall(ownerPage, 'GET', `/api/insights?type=topics&limit=200`);
    const found = topicBefore.body.topics.find((t: { topicId: string }) => t.topicId === testTopicId);
    expect(found).toBeTruthy();
    expect(found.status).not.toBe('produced');

    // 通过内容写入 API 创建测试内容，frontmatter + body.topicId 双通道
    const frontmatter = [
      '---',
      'title: P1-F 发布测试',
      `date: ${new Date().toISOString().slice(0, 10)}`,
      'type: knowledge',
      'form: article',
      'domain: learning',
      'intent: share',
      'valueMode: free',
      'visibility: public',
      'published: true',
      'tags: [test]',
      `sourceTopicId: ${testTopicId}`,
      '---',
      '',
      '# P1-F 测试内容',
      '',
      '验证 sourceTopicId 保留与选题状态回写。',
    ].join('\n');

    const writeRes = await apiCall(ownerPage, 'PUT', `/api/admin/content/${TEST_SLUG}`, {
      content: frontmatter,
      create: true,
      topicId: testTopicId,
      message: 'test: P1-F publish e2e (will be deleted)',
    });
    expect(writeRes.status).toBe(200);
    expect(writeRes.body.ok).toBe(true);
    expect(writeRes.body.topicLinked).toBe(true);

    // 验证选题状态已回写为 produced，且 producedContentSlug 指向该内容
    const topicAfter = await apiCall(ownerPage, 'GET', `/api/insights?type=topics&limit=200`);
    const updated = topicAfter.body.topics.find((t: { topicId: string }) => t.topicId === testTopicId);
    expect(updated).toBeTruthy();
    expect(updated.status).toBe('produced');
    expect(updated.producedContentSlug).toBe(TEST_SLUG);
  });

  test('写入的文件确实包含 sourceTopicId frontmatter（读回校验）', async () => {
    // 通过 GET 内容 API 读回，确认 sourceTopicId 在 frontmatter 中持久化
    const readRes = await apiCall(ownerPage, 'GET', `/api/admin/content/${TEST_SLUG}`);
    expect(readRes.status).toBe(200);
    expect(readRes.body.content).toContain(`sourceTopicId: ${testTopicId}`);
    expect(readRes.body.content).toContain('title: P1-F 发布测试');
  });

  test('未授权写入被拒（401）', async ({ browser }) => {
    const ctx = await browser.newContext();
    const anon = await ctx.newPage();
    await anon.goto('/');
    const res = await anon.evaluate(async () => {
      const r = await fetch('/api/admin/content/some-slug', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'test', create: true }),
      });
      return r.status;
    });
    expect(res).toBe(401);
    await ctx.close();
  });

  test('写入不存在选题的 topicId 返回 404', async () => {
    const frontmatter = [
      '---',
      'title: bad topic',
      `date: ${new Date().toISOString().slice(0, 10)}`,
      'type: knowledge',
      'form: article',
      '---',
      '',
      'bad',
    ].join('\n');
    const res = await apiCall(ownerPage, 'PUT', `/api/admin/content/${TEST_SLUG}-bad`, {
      content: frontmatter,
      create: true,
      topicId: 'topic-does-not-exist',
    });
    expect(res.status).toBe(404);
    // 清理可能误创建的文件
    await apiCall(ownerPage, 'DELETE', `/api/admin/content/${TEST_SLUG}-bad`).catch(() => {});
  });
});
