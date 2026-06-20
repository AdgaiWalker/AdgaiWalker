import { expect, test, type Page } from 'playwright/test';

/**
 * 后台工作台 E2E（P1-F）
 *
 * 验证 P0-D / P0-C 真实闭环：工作台不依赖 localStorage 业务状态，
 * 决定/行动/结果走 WorkItem API，刷新后状态不丢失。
 * 通过 dev-preview 入口建立 owner 会话（仅本机开发，同源 fetch 避免 CSRF）。
 */

/**
 * 用页面上下文同源 fetch 调 dev-preview 建立会话。
 * dev-preview 返回的 Set-Cookie 会被页面上下文接收并自动随后续请求发送（同源）。
 */
async function loginAsOwner(page: Page): Promise<void> {
  await page.goto('/');
  const ok = await page.evaluate(async () => {
    const res = await fetch('/api/auth/dev-preview', { method: 'POST' });
    return res.ok;
  });
  expect(ok).toBe(true);
}

/** 用已登录页面上下文发起同源 fetch，绕开 CSRF；返回 {status, body} */
async function apiCall(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const result = await page.evaluate(async ({ method, path, body }) => {
    const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(path, init);
    const text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: res.status, body: parsed };
  }, { method, path, body });
  return result;
}

test.beforeEach(async ({ page }) => {
  await loginAsOwner(page);
});

test('工作台首屏渲染真实事项，无假"系统可用"', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.locator('h1')).toContainText('今天需要你决定的事');
  // 侧栏状态不应硬编码"系统可用"；本地无 Gateway 数据应显示"状态未知"或"未就绪"
  const foot = page.locator('.adm-context-foot span');
  await expect(foot).not.toContainText('系统可用');
});

test('工作台 API 需授权：未登录读取返回 401', async ({ browser }) => {
  // 用全新无 cookie 的页面上下文验证未授权
  const ctx = await browser.newContext();
  const anonPage = await ctx.newPage();
  await anonPage.goto('/');
  const result = await anonPage.evaluate(async () => {
    const res = await fetch('/api/admin/workbench');
    return res.status;
  });
  expect(result).toBe(401);
  await ctx.close();
});

test('完整闭环：创建提案 → 接受 → 创建行动 → 完成行动 → 记录结果', async ({ page }) => {
  // 1. 创建提案（带证据，请求决定）
  const createRes = await apiCall(page, 'POST', '/api/admin/decisions', {
    queue: 'user-demand',
    title: 'E2E 闭环测试',
    summary: '验证 Evidence -> Decision -> Action -> Outcome',
    priorityBand: 'now',
    evidenceRefs: [{
      evidenceId: 'ev_e2e_1',
      sourceType: 'need-case',
      sourceId: 'nc_e2e',
      occurredAt: '2026-06-20T00:00:00.000Z',
      summary: 'E2E 测试原始需求',
      qualityStatus: 'verified-source',
    }],
    requestDecision: true,
  });
  expect(createRes.status).toBe(201);
  const workItemId = createRes.body.item.workItemId;
  expect(workItemId).toBeTruthy();
  expect(createRes.body.item.status).toBe('pending');

  // 2. 接受
  const decideRes = await apiCall(page, 'PATCH', `/api/admin/decisions/${workItemId}`, {
    decide: { outcome: 'accepted', reason: 'E2E 验证接受' },
  });
  expect(decideRes.status).toBe(200);
  expect(decideRes.body.item.status).toBe('accepted');

  // 3. 创建行动
  const actionRes = await apiCall(page, 'POST', '/api/admin/actions', {
    workItemId,
    actionType: 'create-content',
    targetType: 'content',
    expectedOutcome: 'E2E 产出可验证内容',
  });
  expect(actionRes.status).toBe(201);
  expect(actionRes.body.item.status).toBe('acting');
  const actionId = actionRes.body.item.actions[0].actionId;

  // 4. 完成行动
  const completeRes = await apiCall(page, 'PATCH', `/api/admin/actions/${actionId}`, {
    workItemId, status: 'completed', reason: 'E2E 已完成',
  });
  expect(completeRes.status).toBe(200);

  // 5. 记录结果
  const outcomeRes = await apiCall(page, 'POST', '/api/admin/outcomes', {
    workItemId,
    actionId,
    result: 'successful',
    summary: 'E2E 内容发布后收到正面反馈',
    evidenceRefs: [{
      evidenceId: 'ev_e2e_fb',
      sourceType: 'content-feedback',
      sourceId: 'cf_e2e',
      occurredAt: '2026-06-20T00:00:00.000Z',
      summary: '有用',
      qualityStatus: 'verified-source',
    }],
  });
  expect(outcomeRes.status).toBe(201);
  expect(outcomeRes.body.item.status).toBe('resolved');

  // 6. 刷新验证持久化：单条详情仍可读到
  const detailRes = await apiCall(page, 'GET', `/api/admin/workbench/${workItemId}`);
  expect(detailRes.status).toBe(200);
  expect(detailRes.body.item.status).toBe('resolved');
  expect(detailRes.body.item.outcomes).toHaveLength(1);
  expect(detailRes.body.item.history.length).toBeGreaterThanOrEqual(3); // append-only 审计

  // 7. 结果视图带下一步建议（P1-E02）
  const outcomesView = await apiCall(page, 'GET', '/api/admin/workbench?view=outcomes');
  expect(outcomesView.status).toBe(200);
  const thisItem = outcomesView.body.items.find((i: { workItemId: string }) => i.workItemId === workItemId);
  expect(thisItem).toBeTruthy();
  expect(thisItem.nextSuggestion).toBeTruthy();
  expect(thisItem.nextSuggestion.suggestedActionType).toBe('evaluate-asset');
});

test('工作台状态投影：刷新后事项仍在（不依赖 localStorage）', async ({ page }) => {
  // 先通过 API 创建一个 pending 事项
  const res = await apiCall(page, 'POST', '/api/admin/decisions', {
    queue: 'user-demand',
    title: '持久化刷新测试',
    summary: '验证刷新不丢失',
    priorityBand: 'week',
    evidenceRefs: [{
      evidenceId: 'ev_persist',
      sourceType: 'need-case',
      sourceId: 'nc_persist',
      occurredAt: '2026-06-20T00:00:00.000Z',
      summary: '持久化测试',
      qualityStatus: 'verified-source',
    }],
    requestDecision: true,
  });
  const workItemId = res.body.item.workItemId;

  // 清掉 localStorage（模拟换浏览器/清缓存），工作台仍应显示该事项
  await page.goto('/admin');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // 服务端投影应包含该事项
  const detail = await apiCall(page, 'GET', `/api/admin/workbench/${workItemId}`);
  expect(detail.status).toBe(200);
  expect(detail.body.item.title).toBe('持久化刷新测试');
});

