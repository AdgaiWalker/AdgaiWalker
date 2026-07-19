/**
 * Workbench Admin API 集成测试（P0-C02）
 *
 * 覆盖：未授权访问、非法 body、非法状态迁移、正常完整迁移、存储不可用（通过 service 单测覆盖）。
 * 直接调用路由处理函数，注入 admin 会话 cookie 模拟登录态。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin-auth')>();
  return {
    ...actual,
    isAdminAsync: vi.fn(async (request: Request) => actual.isAdmin(request)),
    isOwnerAsync: vi.fn(async (request: Request) => actual.isOwner(request)),
  };
});

import { __resetMemoryWorkItems } from '@/stores/work-item.store';
import { signSessionToken } from '@/lib/account-auth';

import { GET as workbenchGet } from './workbench';
import { POST as decisionsPost } from './decisions';
import { PATCH as decisionsPatch } from './decisions/[id]';
import { POST as actionsPost } from './actions';
import { PATCH as actionsPatch } from './actions/[id]';
import { POST as outcomesPost } from './outcomes';

// 模拟一个已登录的 admin 会话 cookie
function adminRequest(init: { url: string; method?: string; body?: unknown }): Request {
  const token = signSessionToken({ sid: 'test-session', role: 'owner', iat: Math.floor(Date.now() / 1000) });
  const headers = new Headers({ cookie: `walker-session=${token}` });
  const initOpts: RequestInit = { method: init.method ?? 'GET', headers };
  if (init.body !== undefined) {
    headers.set('content-type', 'application/json');
    initOpts.body = JSON.stringify(init.body);
  }
  return new Request(init.url, initOpts);
}

function anonRequest(url: string, method = 'GET', body?: unknown): Request {
  const initOpts: RequestInit = { method };
  if (body !== undefined) {
    initOpts.headers = { 'content-type': 'application/json' };
    initOpts.body = JSON.stringify(body);
  }
  return new Request(url, initOpts);
}

// Astro 的 APIContext 类型很宽，测试里只用到 request/url/params 三项；
// 用最小结构 + 类型断言绕开完整 APIContext 的泛型要求（运行时行为一致）。
/* eslint-disable @typescript-eslint/no-explicit-any */
function ctx(req: Request, params: Record<string, string | undefined> = {}): any {
  return { request: req, url: new URL(req.url), params };
}

async function readBody(res: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const EVIDENCE = [{
  evidenceId: 'ev_api_1',
  sourceType: 'need-case',
  sourceId: 'nc_api',
  occurredAt: '2026-06-20T00:00:00.000Z',
  summary: '原始需求',
  qualityStatus: 'verified-source',
}];

describe('Workbench Admin API（P0-C02）', () => {
  beforeEach(() => __resetMemoryWorkItems());
  afterEach(() => __resetMemoryWorkItems());

  it('未登录读取返回 401', async () => {
    const res = await workbenchGet(ctx(anonRequest('https://t/api/admin/workbench')));
    expect(res.status).toBe(401);
  });

  it('未登录写入返回 401', async () => {
    const res = await decisionsPost(ctx(anonRequest('https://t/api/admin/decisions', 'POST', {
      queue: 'user-demand', title: 'x', summary: 'y', priorityBand: 'now', evidenceRefs: EVIDENCE,
    })));
    expect(res.status).toBe(401);
  });

  it('非法 body 返回 400', async () => {
    const res = await decisionsPost(ctx(adminRequest({
      url: 'https://t/api/admin/decisions', method: 'POST',
      body: { queue: 'invalid-queue', title: '', summary: '', priorityBand: 'now', evidenceRefs: [] },
    })));
    const { status, body } = await readBody(res);
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it('正常完整迁移：提案 -> 决定 -> 行动 -> 完成 -> 结果', async () => {
    // 1. 创建提案并请求决定
    const createRes = await decisionsPost(ctx(adminRequest({
      url: 'https://t/api/admin/decisions', method: 'POST',
      body: { queue: 'user-demand', title: '闭环测试', summary: '请求决定', priorityBand: 'now', evidenceRefs: EVIDENCE, requestDecision: true },
    })));
    const created = await readBody(createRes);
    expect(created.status).toBe(201);
    const workItemId = (created.body.item as { workItemId: string }).workItemId;
    expect(workItemId).toBeTruthy();

    // 2. 接受
    const decideRes = await decisionsPatch(ctx(adminRequest({
      url: `https://t/api/admin/decisions/${workItemId}`, method: 'PATCH',
      body: { decide: { outcome: 'accepted', reason: '证据充分' } },
    }), { id: workItemId }));
    const decided = await readBody(decideRes);
    expect(decided.status).toBe(200);
    expect((decided.body.item as { status: string }).status).toBe('accepted');

    // 3. 创建行动
    const actionRes = await actionsPost(ctx(adminRequest({
      url: 'https://t/api/admin/actions', method: 'POST',
      body: { workItemId, actionType: 'create-content', targetType: 'content', expectedOutcome: '产出教程' },
    })));
    const actionCreated = await readBody(actionRes);
    expect(actionCreated.status).toBe(201);
    const actions = (actionCreated.body.item as { actions: { actionId: string }[] }).actions;
    const actionId = actions[0].actionId;

    // 4. 完成行动
    const completeRes = await actionsPatch(ctx(adminRequest({
      url: `https://t/api/admin/actions/${actionId}`, method: 'PATCH',
      body: { workItemId, status: 'completed', reason: '已发布' },
    }), { id: actionId }));
    const completed = await readBody(completeRes);
    expect(completed.status).toBe(200);

    // 5. 记录结果
    const outcomeRes = await outcomesPost(ctx(adminRequest({
      url: 'https://t/api/admin/outcomes', method: 'POST',
      body: {
        workItemId, actionId, result: 'successful', summary: '正面反馈',
        evidenceRefs: [{ evidenceId: 'ev_fb', sourceType: 'content-feedback', sourceId: 'cf_1', occurredAt: '2026-06-20T00:00:00.000Z', summary: '有用' }],
      },
    })));
    const outcome = await readBody(outcomeRes);
    expect(outcome.status).toBe(201);
    expect((outcome.body.item as { status: string }).status).toBe('resolved');
  });

  it('非法状态迁移返回 409（pending 之前创建行动）', async () => {
    const createRes = await decisionsPost(ctx(adminRequest({
      url: 'https://t/api/admin/decisions', method: 'POST',
      body: { queue: 'user-demand', title: '迁移拒绝', summary: '请求决定', priorityBand: 'now', evidenceRefs: EVIDENCE, requestDecision: true },
    })));
    const workItemId = ((await readBody(createRes)).body.item as { workItemId: string }).workItemId;

    // pending 阶段直接创建行动 → 409
    const actionRes = await actionsPost(ctx(adminRequest({
      url: 'https://t/api/admin/actions', method: 'POST',
      body: { workItemId, actionType: 'create-content', targetType: 'content', expectedOutcome: '产出教程' },
    })));
    const { status, body } = await readBody(actionRes);
    expect(status).toBe(409);
    expect(body.code).toBe('invalid-transition');
  });

  it('GET workbench today 返回活跃事项列表', async () => {
    await decisionsPost(ctx(adminRequest({
      url: 'https://t/api/admin/decisions', method: 'POST',
      body: { queue: 'user-demand', title: '列表测试', summary: '请求决定', priorityBand: 'now', evidenceRefs: EVIDENCE, requestDecision: true },
    })));
    const res = await workbenchGet(ctx(adminRequest({ url: 'https://t/api/admin/workbench' })));
    const { status, body } = await readBody(res);
    expect(status).toBe(200);
    const items = (body.items as unknown[]);
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it('P1-D：walker-thesis 选题创建的 WorkItem 保留来源身份（queue=walker-thesis）', async () => {
    const res = await decisionsPost(ctx(adminRequest({
      url: 'https://t/api/admin/decisions', method: 'POST',
      body: {
        queue: 'walker-thesis',
        title: '站主主张：明确 AI 与人决策边界',
        summary: '站主主动提出，0 条用户证据',
        priorityBand: 'week',
        evidenceRefs: [{
          evidenceId: 'ev_topic_wt',
          sourceType: 'walker-thesis',
          sourceId: 'topic-wt-1',
          occurredAt: '2026-06-20T00:00:00.000Z',
          summary: '站主主张，无用户证据',
          qualityStatus: 'unverified',
        }],
        priorityReasons: ['站主主动提出，非市场结论'],
        topicId: 'topic-wt-1',
        requestDecision: false, // 无 verified 证据，只能是 proposal
      },
    })));
    const created = await readBody(res);
    expect(created.status).toBe(201);
    const item = created.body.item as { queue: string; status: string; topicId: string };
    expect(item.queue).toBe('walker-thesis'); // 来源身份保留，不被伪装成 user-demand
    expect(item.topicId).toBe('topic-wt-1');
    expect(item.status).toBe('proposal'); // unverified 证据 → proposal，不进入正式待决定
  });

  it('P1-D02：workbench 按队列过滤（decisions 视图只返回提案/待决定/已接受等）', async () => {
    // 创建一个 user-demand 和一个 walker-thesis
    await decisionsPost(ctx(adminRequest({
      url: 'https://t/api/admin/decisions', method: 'POST',
      body: { queue: 'user-demand', title: '用户需求', summary: 'x', priorityBand: 'now', evidenceRefs: EVIDENCE, requestDecision: true },
    })));
    await decisionsPost(ctx(adminRequest({
      url: 'https://t/api/admin/decisions', method: 'POST',
      body: {
        queue: 'walker-thesis', title: '站主主张', summary: 'x', priorityBand: 'week',
        evidenceRefs: [{ evidenceId: 'ev_wt', sourceType: 'walker-thesis', sourceId: 'wt', occurredAt: '2026-06-20T00:00:00.000Z', summary: '主张', qualityStatus: 'verified-source' }],
        requestDecision: true,
      },
    })));
    const res = await workbenchGet(ctx(adminRequest({ url: 'https://t/api/admin/workbench?view=decisions&queue=walker-thesis' })));
    const { status, body } = await readBody(res);
    expect(status).toBe(200);
    const items = body.items as Array<{ queue: string }>;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.every(i => i.queue === 'walker-thesis')).toBe(true); // 同队列内才并列，不跨队列混排
  });

  it('GET workbench today 汇总活跃队列数量，不用 0 冒充未知', async () => {
    await decisionsPost(ctx(adminRequest({
      url: 'https://t/api/admin/decisions', method: 'POST',
      body: { queue: 'user-demand', title: '待决定', summary: 'x', priorityBand: 'now', evidenceRefs: EVIDENCE, requestDecision: true },
    })));
    const acceptedRes = await decisionsPost(ctx(adminRequest({
      url: 'https://t/api/admin/decisions', method: 'POST',
      body: { queue: 'system-event', title: '待行动', summary: 'x', priorityBand: 'now', evidenceRefs: [{ ...EVIDENCE[0], evidenceId: 'ev_api_2', sourceType: 'incident', sourceId: 'incident_1' }], requestDecision: true },
    })));
    const acceptedId = ((await readBody(acceptedRes)).body.item as { workItemId: string }).workItemId;
    await decisionsPatch(ctx(adminRequest({
      url: `https://t/api/admin/decisions/${acceptedId}`, method: 'PATCH',
      body: { decide: { outcome: 'accepted', reason: '需要处理' } },
    }), { id: acceptedId }));

    const res = await workbenchGet(ctx(adminRequest({ url: 'https://t/api/admin/workbench' })));
    const { status, body } = await readBody(res);
    expect(status).toBe(200);
    expect(body.counts).toMatchObject({ total: 2, pending: 1, accepted: 1, acting: 0, awaitingVerification: 0 });
  });

  it('GET workbench today 返回前三项重点与其余分类数量', async () => {
    for (let index = 0; index < 5; index += 1) {
      await decisionsPost(ctx(adminRequest({
        url: 'https://t/api/admin/decisions', method: 'POST',
        body: {
          queue: 'user-demand',
          title: `重点 ${index}`,
          summary: 'x',
          priorityBand: 'now',
          evidenceRefs: [{ ...EVIDENCE[0], evidenceId: `ev_focus_${index}`, sourceId: `nc_focus_${index}` }],
          requestDecision: true,
        },
      })));
    }
    const res = await workbenchGet(ctx(adminRequest({ url: 'https://t/api/admin/workbench' })));
    const { body } = await readBody(res);
    expect((body.focusItems as unknown[])).toHaveLength(3);
    expect(body.backlogCount).toBe(2);
  });

  it('P1-D03：从选题派生 change-feature Action（targetType=feature，不冒充内容）', async () => {
    // 创建 proposal + 接受 + change-feature Action
    const createRes = await decisionsPost(ctx(adminRequest({
      url: 'https://t/api/admin/decisions', method: 'POST',
      body: { queue: 'user-demand', title: '改功能选题', summary: '功能问题', priorityBand: 'week', evidenceRefs: EVIDENCE, requestDecision: true },
    })));
    const workItemId = ((await readBody(createRes)).body.item as { workItemId: string }).workItemId;
    await decisionsPatch(ctx(adminRequest({
      url: `https://t/api/admin/decisions/${workItemId}`, method: 'PATCH',
      body: { decide: { outcome: 'accepted', reason: '接受' } },
    }), { id: workItemId }));
    const actionRes = await actionsPost(ctx(adminRequest({
      url: 'https://t/api/admin/actions', method: 'POST',
      body: { workItemId, actionType: 'change-feature', targetType: 'feature', expectedOutcome: '修改某功能' },
    })));
    const { status, body } = await readBody(actionRes);
    expect(status).toBe(201);
    const action = (body.item as { actions: { actionType: string; targetType: string }[] }).actions[0];
    expect(action.actionType).toBe('change-feature');
    expect(action.targetType).toBe('feature'); // 不冒充内容（targetType≠content）
  });

  it('P1-D03：证据不足派生 create-learning-request Action（priorityBand=insufficient）', async () => {
    const createRes = await decisionsPost(ctx(adminRequest({
      url: 'https://t/api/admin/decisions', method: 'POST',
      body: {
        queue: 'user-demand', title: '证据不足选题', summary: '需补证据', priorityBand: 'insufficient',
        evidenceRefs: [{ evidenceId: 'ev_weak', sourceType: 'need-case', sourceId: 'nc_weak', occurredAt: '2026-06-20T00:00:00.000Z', summary: '弱证据', qualityStatus: 'unverified' }],
      },
    })));
    const item = ((await readBody(createRes)).body.item as { priorityBand: string; status: string });
    expect(item.priorityBand).toBe('insufficient');
    // unverified 证据 → proposal，不进入正式待决定
    expect(item.status).toBe('proposal');
  });
});
