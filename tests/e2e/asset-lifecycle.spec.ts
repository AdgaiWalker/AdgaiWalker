import { expect, test, type Page } from 'playwright/test';

/**
 * P2-B E2E：资产生命周期页 + 晋升 API + 学习请求
 *
 * 验证：
 *  1. /admin/assets 页可访问，渲染生命周期说明
 *  2. 晋升 API：注册 Skill 必须有支撑证据（missing-evidence）；带证据则成功
 *  3. 学习请求：创建 → /admin/assets 显示待补证 → 标记完成 → 状态更新
 *  4. 支撑证据反查 API：返回该资产的晋升证据链
 */

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

test.describe.serial('P2-B 资产生命周期', () => {
  test('资产一级入口进入资产总览，学习任务拥有独立视图地址', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/admin');
    await expect(page.getByRole('link', { name: '资产', exact: true })).toHaveAttribute('href', '/admin/assets');

    await page.getByRole('link', { name: '资产', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/assets$/);
    await expect(page.getByRole('link', { name: '学习任务', exact: true })).toHaveAttribute('href', '/admin/assets?view=learning');
  });

  test('晋升 Skill 必须有支撑证据', async ({ page }) => {
    await loginAsOwner(page);
    // 无证据注册 Skill → 409 missing-evidence
    const blocked = await apiCall(page, 'POST', '/api/admin/assets/promote', {
      assetKind: 'skill', assetId: 'skill-e2e-1', toStage: 'validated', reason: '想注册',
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('missing-evidence');

    // 带 Outcome 证据 → 201
    const ok = await apiCall(page, 'POST', '/api/admin/assets/promote', {
      assetKind: 'skill', assetId: 'skill-e2e-1', toStage: 'validated',
      sourceOutcomeIds: ['outcome-e2e-1'], reason: '有 Outcome 支撑',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.link.sourceOutcomeIds).toEqual(['outcome-e2e-1']);
    expect(ok.body.link.approvedBy).toBeTruthy();
  });

  test('支撑证据反查：返回该资产的晋升证据链', async ({ page }) => {
    await loginAsOwner(page);
    // 先晋升一次
    await apiCall(page, 'POST', '/api/admin/assets/promote', {
      assetKind: 'rule', assetId: 'rule-e2e-1', toStage: 'candidate',
      sourceOutcomeIds: ['o-a'], sourceExperienceIds: ['e-a'], reason: '反查测试',
    });
    const res = await apiCall(page, 'GET', '/api/admin/assets/evidence?kind=rule&assetId=rule-e2e-1');
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    expect(res.body.links[0].sourceOutcomeIds).toContain('o-a');
    expect(res.body.links[0].sourceExperienceIds).toContain('e-a');
  });

  test('学习请求：创建 → 页面显示', async ({ page }) => {
    await loginAsOwner(page);
    // 创建学习请求
    const create = await apiCall(page, 'POST', '/api/admin/learning-requests', {
      evidenceGap: 'counter-example',
      context: 'E2E 缺反例验证',
      expectedEvidence: '至少 1 个失败边界',
    });
    expect(create.status).toBe(201);
    const requestId = create.body.request.requestId;

    // 访问 /admin/assets，看到待补证任务
    await page.goto('/admin/assets');
    await expect(page.getByRole('heading', { name: '资产生命周期' })).toBeVisible();
    const card = page.locator(`.learning-card[data-request-id="${requestId}"]`);
    await expect(card).toBeVisible();
    await expect(card).toContainText('E2E 缺反例验证');
  });

  test('学习请求标记完成（API 直验）', async ({ page }) => {
    await loginAsOwner(page);
    const create = await apiCall(page, 'POST', '/api/admin/learning-requests', {
      evidenceGap: 'practice', context: 'E2E 补实践', expectedEvidence: '一次执行',
    });
    const requestId = create.body.request.requestId;
    const fulfill = await apiCall(page, 'PATCH', '/api/admin/learning-requests', {
      requestId, fulfillmentNote: '已执行，结果成功',
    });
    expect(fulfill.status).toBe(200);
    expect(fulfill.body.request.status).toBe('fulfilled');
    expect(fulfill.body.request.fulfillmentNote).toBe('已执行，结果成功');
  });

  test('学习任务视图使用界面内表单记录补证结果', async ({ page }) => {
    await loginAsOwner(page);
    const create = await apiCall(page, 'POST', '/api/admin/learning-requests', {
      evidenceGap: 'practice', context: `E2E 内联补证 ${Date.now()}`, expectedEvidence: '一次执行记录',
    });
    const requestId = create.body.request.requestId;

    await page.goto(`/admin/assets?view=learning&requestId=${requestId}`);
    await expect(page.getByRole('heading', { name: /最近晋升/ })).toHaveCount(0);
    const card = page.locator(`.learning-card[data-request-id="${requestId}"]`);
    await card.getByRole('button', { name: '标记已补证' }).click();
    const form = card.locator('[data-fulfill-form]');
    await expect(form).toBeVisible();
    await form.getByLabel('补证结果').fill('已完成一次真实执行，记录成功与失败边界');
    await form.getByRole('button', { name: '确认完成' }).click();
    await expect(card).toHaveClass(/is-done/);
    await expect(card.locator('[data-status-msg]')).toContainText('已标记完成');
  });

  test('支撑证据在页面面板中展示，不使用浏览器原生弹窗', async ({ page }) => {
    await loginAsOwner(page);
    const reason = `E2E 面板证据 ${Date.now()}`;
    const promoted = await apiCall(page, 'POST', '/api/admin/assets/promote', {
      assetKind: 'rule', assetId: `rule-panel-${Date.now()}`, toStage: 'candidate',
      sourceOutcomeIds: ['outcome-panel'], reason,
    });
    expect(promoted.status).toBe(201);

    await page.goto('/admin/assets');
    const card = page.locator('.promotion-card').filter({ hasText: reason });
    await card.getByRole('button', { name: '查看支撑证据' }).click();
    const dialog = page.locator('[data-evidence-dialog]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(reason);
    await dialog.getByRole('button', { name: '关闭证据面板' }).click();
    await expect(dialog).toBeHidden();
  });

  test('未授权访问资产 API 返回 401', async ({ browser }) => {
    const ctx = await browser.newContext();
    const anon = await ctx.newPage();
    await anon.goto('/');
    const status = await anon.evaluate(async () => {
      const r = await fetch('/api/admin/assets/promote', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetKind: 'rule', assetId: 'x', toStage: 'candidate', reason: 'x', sourceOutcomeIds: ['o'] }),
      });
      return r.status;
    });
    expect(status).toBe(401);
    await ctx.close();
  });
});
