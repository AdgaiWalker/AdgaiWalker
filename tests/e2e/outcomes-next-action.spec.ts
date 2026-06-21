import { expect, test, type Page } from 'playwright/test';

/**
 * P1-E02 E2E：结果页"创建下一步行动"按钮
 *
 * 验证：
 *  1. 完成一条闭环（proposal→accepted→action→completed→outcome resolved）
 *  2. 访问 /admin/outcomes，看到该事项与下一步候选按钮
 *  3. 点击"创建下一步行动"，新的 WorkItem + Action 被创建（不自动执行，需显式点击）
 *  4. 候选动作类型由上一个 Outcome 结果派生（successful → evaluate-asset）
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

test('P1-E02：结果页候选动作按钮创建新 Decision + Action', async ({ page }) => {
  await loginAsOwner(page);

  // 1. 完成闭环：proposal → accepted → action → completed → outcome(resolved)
  const createRes = await apiCall(page, 'POST', '/api/admin/decisions', {
    queue: 'user-demand',
    title: 'P1-E02 闭环事项',
    summary: '验证结果页下一步',
    priorityBand: 'now',
    evidenceRefs: [{
      evidenceId: 'ev_p1e02', sourceType: 'need-case', sourceId: 'nc_p1e02',
      occurredAt: '2026-06-20T00:00:00.000Z', summary: '原始需求', qualityStatus: 'verified-source',
    }],
    requestDecision: true,
  });
  const workItemId = createRes.body.item.workItemId;

  await apiCall(page, 'PATCH', `/api/admin/decisions/${workItemId}`, {
    decide: { outcome: 'accepted', reason: '接受' },
  });
  const actionRes = await apiCall(page, 'POST', '/api/admin/actions', {
    workItemId, actionType: 'create-content', targetType: 'content', expectedOutcome: '产出内容',
  });
  const actionId = actionRes.body.item.actions[0].actionId;
  await apiCall(page, 'PATCH', `/api/admin/actions/${actionId}`, {
    workItemId, status: 'completed', reason: '完成',
  });
  await apiCall(page, 'POST', '/api/admin/outcomes', {
    workItemId, actionId, result: 'successful', summary: '正面反馈',
    evidenceRefs: [{
      evidenceId: 'ev_p1e02_fb', sourceType: 'content-feedback', sourceId: 'cf_p1e02',
      occurredAt: '2026-06-20T00:00:00.000Z', summary: '有用', qualityStatus: 'verified-source',
    }],
  });

  // 2. 访问结果页，看到该事项与候选按钮
  await page.goto('/admin/outcomes');
  await expect(page.getByRole('heading', { name: '结果与下一步' })).toBeVisible();
  const card = page.locator(`.outcome-card[data-work-item-id="${workItemId}"]`);
  await expect(card).toBeVisible();
  const nextBtn = card.locator('[data-create-next]');
  await expect(nextBtn).toBeVisible();
  // successful → evaluate-asset
  await expect(nextBtn).toHaveAttribute('data-action-type', 'evaluate-asset');

  // 3. 记录创建前含 evaluate-asset 行动的 WorkItem 数
  const beforeActions = await apiCall(page, 'GET', '/api/admin/workbench?view=actions&limit=100');
  const beforeAssetCount = beforeActions.body.items.filter((i: { actions: { actionType: string }[] }) =>
    i.actions.some((a: { actionType: string }) => a.actionType === 'evaluate-asset')).length;

  // 4. 点击"创建下一步行动"
  await nextBtn.click();
  // 等待按钮变为"已创建"
  await expect.poll(async () => nextBtn.textContent(), { timeout: 8000 }).toContain('已创建');

  // 5. 验证新的 WorkItem + Action 被创建（含 evaluate-asset 行动的事项增加）
  const afterActions = await apiCall(page, 'GET', '/api/admin/workbench?view=actions&limit=100');
  const afterAssetCount = afterActions.body.items.filter((i: { actions: { actionType: string }[] }) =>
    i.actions.some((a: { actionType: string }) => a.actionType === 'evaluate-asset')).length;
  expect(afterAssetCount).toBeGreaterThan(beforeAssetCount);
});
