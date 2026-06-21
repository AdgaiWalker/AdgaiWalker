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
  await expect(page.locator('.workbench-head h1')).toContainText('今天需要你决定的事');
  // 侧栏状态不应硬编码"系统可用"；本地无 Gateway 数据应显示"状态未知"或"未就绪"
  const foot = page.locator('.adm-context-foot span');
  await expect(foot).not.toContainText('系统可用');
});

test('没有持久化 Walker 主张时，工作台不制造固定主张事项', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByText('明确后台中 AI 与人的决策边界', { exact: true })).toHaveCount(0);
});

test('需要处理的内容反馈会进入工作台，并保留原始说明', async ({ page }) => {
  const note = `E2E 工作台补充说明 ${Date.now()}`;
  const feedback = await apiCall(page, 'POST', '/api/content-feedback', {
    contentId: 'side-hustle-blueprint',
    signal: 'needs-more',
    note,
    consentForAnalysis: true,
  });
  expect(feedback.status).toBe(201);

  await page.goto('/admin');
  const item = page.locator('[data-decision-item][data-source="内容反馈"]').filter({ hasText: '补充' }).first();
  await expect(item).toBeVisible();
  await item.click();
  await page.getByRole('button', { name: '原始证据' }).click();
  await expect(page.locator('[data-detail-evidence-body]')).toContainText(note);
});

test('待补证学习任务会进入工作台', async ({ page }) => {
  const context = `E2E 待补证 ${Date.now()}`;
  const created = await apiCall(page, 'POST', '/api/admin/learning-requests', {
    evidenceGap: 'practice',
    context,
    expectedEvidence: '完成一次真实实践并记录结果',
  });
  expect(created.status).toBe(201);
  const requestId = created.body.request.requestId;

  await page.goto('/admin');
  const item = page.locator(`[data-decision-item][data-id="learning-${requestId}"]`);
  await expect(item).toBeVisible();
});

test('暂缓事项使用界面内表单，并立即显示真实状态', async ({ page }) => {
  const title = `E2E 内联暂缓 ${Date.now()}`;
  const created = await apiCall(page, 'POST', '/api/admin/decisions', {
    queue: 'user-demand',
    title,
    summary: '验证暂缓不使用浏览器原生弹窗',
    priorityBand: 'now',
    evidenceRefs: [{
      evidenceId: `ev_pause_${Date.now()}`,
      sourceType: 'need-case',
      sourceId: `need_pause_${Date.now()}`,
      occurredAt: new Date().toISOString(),
      summary: '真实需求证据',
      qualityStatus: 'verified-source',
    }],
    requestDecision: true,
  });
  expect(created.status).toBe(201);

  await page.goto('/admin');
  const item = page.locator('[data-decision-item]').filter({ hasText: title }).first();
  await item.click();
  await page.getByRole('button', { name: '暂缓', exact: true }).click();

  const form = page.locator('[data-pause-form]');
  await expect(form).toBeVisible();
  await form.getByLabel('复查条件或暂缓原因').fill('等待另外两条真实反馈后复查');
  await form.getByRole('button', { name: '确认暂缓' }).click();
  await expect(form).toBeHidden();
  await expect(item).toHaveAttribute('data-state', 'paused');
  await expect(page.locator('.status-pill')).toContainText('已暂缓');
});

test('内容反馈可在工作台形成带原始证据的修改内容行动', async ({ page }) => {
  const note = `E2E 修改内容行动 ${Date.now()}`;
  const feedback = await apiCall(page, 'POST', '/api/content-feedback', {
    contentId: 'side-hustle-blueprint',
    signal: 'needs-more',
    note,
    consentForAnalysis: true,
  });
  expect(feedback.status).toBe(201);
  const feedbackId = feedback.body.feedbackId;

  await page.goto('/admin');
  const item = page.locator(`[data-decision-item][data-id="content-feedback-${feedbackId}"]`);
  await item.click();
  await page.getByRole('button', { name: '修改内容', exact: true }).click();
  await page.getByLabel('我已检查证据，允许 AI 按步骤生成草稿').check();
  await page.getByRole('button', { name: '确认并执行' }).click();
  await expect(page.locator('.execution-head')).toContainText('工作项已建立', { timeout: 10_000 });

  const actions = await apiCall(page, 'GET', '/api/admin/workbench?view=actions');
  const created = actions.body.items.find((entry: any) => entry.title.includes('side-hustle-blueprint'));
  expect(created).toBeTruthy();
  expect(created.evidenceRefs.some((ref: any) => ref.sourceType === 'content-feedback' && ref.sourceId === feedbackId)).toBe(true);
  expect(created.actions.at(-1)?.actionType).toBe('update-content');
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

test('待验证事项可在工作台详情内记录 Outcome 并看到下一步状态', async ({ page }) => {
  const title = `E2E 详情内 Outcome ${Date.now()}`;
  const createRes = await apiCall(page, 'POST', '/api/admin/decisions', {
    queue: 'user-demand',
    title,
    summary: '验证不用离开工作台即可记录现实结果',
    priorityBand: 'now',
    evidenceRefs: [{
      evidenceId: `ev_inline_outcome_${Date.now()}`,
      sourceType: 'need-case',
      sourceId: `nc_inline_outcome_${Date.now()}`,
      occurredAt: new Date().toISOString(),
      summary: '真实需求证据',
      qualityStatus: 'verified-source',
    }],
    requestDecision: true,
  });
  expect(createRes.status).toBe(201);
  const workItemId = createRes.body.item.workItemId;

  const decideRes = await apiCall(page, 'PATCH', `/api/admin/decisions/${workItemId}`, {
    decide: { outcome: 'accepted', reason: '进入执行验证' },
  });
  expect(decideRes.status).toBe(200);
  const actionRes = await apiCall(page, 'POST', '/api/admin/actions', {
    workItemId,
    actionType: 'update-content',
    targetType: 'content',
    targetId: 'side-hustle-blueprint',
    expectedOutcome: '内容更新后收到明确反馈',
  });
  expect(actionRes.status).toBe(201);
  const actionId = actionRes.body.item.actions.at(-1).actionId;
  const completeRes = await apiCall(page, 'PATCH', `/api/admin/actions/${actionId}`, {
    workItemId,
    status: 'completed',
    reason: '内容已更新，等待现实验证',
  });
  expect(completeRes.status).toBe(200);

  await page.goto('/admin');
  const item = page.locator('[data-decision-item]').filter({ hasText: title }).first();
  await expect(item).toBeVisible();
  await item.click();
  await page.getByRole('button', { name: '下一步' }).click();

  const form = page.locator('[data-outcome-form]');
  await expect(form).toBeVisible();
  await form.locator('select[name="result"]').selectOption('partial');
  await form.locator('textarea[name="summary"]').fill('有帮助，但仍需要补一个边界案例');
  await form.getByRole('button', { name: '保存 Outcome' }).click();
  await expect(form.locator('[data-outcome-status]')).toContainText('Outcome 已保存', { timeout: 10_000 });

  const detail = await apiCall(page, 'GET', `/api/admin/workbench/${workItemId}`);
  expect(detail.status).toBe(200);
  expect(detail.body.item.status).toBe('resolved');
  expect(detail.body.item.outcomes.at(-1).result).toBe('partial');
});

test('开发演示场景明确标注模拟数据，并可一键清理', async ({ page }) => {
  await page.goto('/admin');
  const demo = page.locator('[data-demo-scenario]');
  await expect(demo).toBeVisible();
  await expect(demo).toContainText('开发演示场景');
  await expect(demo).toContainText('模拟数据');

  await demo.getByRole('button', { name: '生成模拟闭环' }).click();
  await expect(demo.locator('[data-demo-status]')).toContainText('模拟闭环已生成', { timeout: 10_000 });
  await page.reload();
  await expect(page.locator('[data-decision-item]').filter({ hasText: '【模拟数据】补充副业蓝图边界案例' }).first()).toBeVisible();

  await page.locator('[data-demo-scenario]').getByRole('button', { name: '清理模拟数据' }).click();
  await expect(page.locator('[data-demo-scenario] [data-demo-status]')).toContainText('模拟数据已清理', { timeout: 10_000 });
  await page.reload();
  await expect(page.getByText('【模拟数据】补充副业蓝图边界案例')).toHaveCount(0);
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
