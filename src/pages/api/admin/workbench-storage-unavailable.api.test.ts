import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin-auth', () => ({
  isAdminAsync: vi.fn().mockResolvedValue(true),
}));

import { signSessionToken } from '@/lib/account-auth';

const service = {
  createProposal: vi.fn(),
  requestDecision: vi.fn(),
  decide: vi.fn(),
  overridePriority: vi.fn(),
  createAction: vi.fn(),
  updateAction: vi.fn(),
  recordOutcome: vi.fn(),
};

vi.mock('@/services/workbench.service', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/workbench.service')>();
  return {
    ...actual,
    createWorkbenchService: () => service,
  };
});

import { POST as decisionsPost } from './decisions';
import { PATCH as decisionsPatch } from './decisions/[id]';
import { POST as actionsPost } from './actions';
import { PATCH as actionsPatch } from './actions/[id]';
import { POST as outcomesPost } from './outcomes';

function storageUnavailable() {
  return { ok: false as const, code: 'storage-unavailable' as const, message: '生产环境缺少持久化存储。' };
}

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

// Astro 的 APIContext 很宽，测试只需要 request/url/params。
/* eslint-disable @typescript-eslint/no-explicit-any */
function ctx(req: Request, params: Record<string, string | undefined> = {}): any {
  return { request: req, url: new URL(req.url), params };
}

async function readBody(res: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const evidenceRefs = [{
  evidenceId: 'ev_storage_gate',
  sourceType: 'need-case',
  sourceId: 'nc_storage_gate',
  occurredAt: '2026-06-20T00:00:00.000Z',
  summary: '生产缺 Redis API 门闩证据',
  qualityStatus: 'verified-source',
}];

describe('S0 API 存储不可用门闩', () => {
  beforeEach(() => {
    for (const fn of Object.values(service)) fn.mockReset();
  });

  it('创建 Decision 写入在存储不可用时返回 503', async () => {
    service.createProposal.mockResolvedValue(storageUnavailable());
    const res = await decisionsPost(ctx(adminRequest({
      url: 'https://t/api/admin/decisions',
      method: 'POST',
      body: { queue: 'user-demand', title: '生产缺 Redis', summary: '不能写入', priorityBand: 'now', evidenceRefs },
    })));
    const { status, body } = await readBody(res);
    expect(status).toBe(503);
    expect(body.code).toBe('storage-unavailable');
  });

  it('更新 Decision 写入在存储不可用时返回 503', async () => {
    service.decide.mockResolvedValue(storageUnavailable());
    const res = await decisionsPatch(ctx(adminRequest({
      url: 'https://t/api/admin/decisions/wi_1',
      method: 'PATCH',
      body: { decide: { outcome: 'accepted', reason: '证据充分' } },
    }), { id: 'wi_1' }));
    const { status, body } = await readBody(res);
    expect(status).toBe(503);
    expect(body.code).toBe('storage-unavailable');
  });

  it('创建 Action 写入在存储不可用时返回 503', async () => {
    service.createAction.mockResolvedValue(storageUnavailable());
    const res = await actionsPost(ctx(adminRequest({
      url: 'https://t/api/admin/actions',
      method: 'POST',
      body: { workItemId: 'wi_1', actionType: 'create-content', targetType: 'content', expectedOutcome: '发布内容' },
    })));
    const { status, body } = await readBody(res);
    expect(status).toBe(503);
    expect(body.code).toBe('storage-unavailable');
  });

  it('更新 Action 写入在存储不可用时返回 503', async () => {
    service.updateAction.mockResolvedValue(storageUnavailable());
    const res = await actionsPatch(ctx(adminRequest({
      url: 'https://t/api/admin/actions/wa_1',
      method: 'PATCH',
      body: { workItemId: 'wi_1', status: 'completed', reason: '已完成' },
    }), { id: 'wa_1' }));
    const { status, body } = await readBody(res);
    expect(status).toBe(503);
    expect(body.code).toBe('storage-unavailable');
  });

  it('记录 Outcome 写入在存储不可用时返回 503', async () => {
    service.recordOutcome.mockResolvedValue(storageUnavailable());
    const res = await outcomesPost(ctx(adminRequest({
      url: 'https://t/api/admin/outcomes',
      method: 'POST',
      body: {
        workItemId: 'wi_1',
        actionId: 'wa_1',
        result: 'successful',
        summary: '已验证',
        evidenceRefs,
      },
    })));
    const { status, body } = await readBody(res);
    expect(status).toBe(503);
    expect(body.code).toBe('storage-unavailable');
  });
});
