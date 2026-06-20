import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetMemoryWorkItems } from '@/conversation/store';
import { createWorkbenchService, suggestNextAction } from './workbench.service';

import type { EvidenceRef } from '@/stores/ports';

function makeEvidence(over: Partial<EvidenceRef> = {}): EvidenceRef {
  return {
    evidenceId: `ev_${Math.random().toString(36).slice(2, 8)}`,
    sourceType: 'need-case',
    sourceId: 'nc_test',
    occurredAt: '2026-06-20T00:00:00.000Z',
    collectedAt: '2026-06-20T00:00:00.000Z',
    environment: 'development',
    visibility: 'owner',
    freshness: 'fresh',
    qualityStatus: 'verified-source',
    summary: '一条可信的原始需求',
    ...over,
  };
}

describe('WorkbenchService 状态机（hai-razor 信任边界）', () => {
  beforeEach(() => __resetMemoryWorkItems());
  afterEach(() => __resetMemoryWorkItems());

  it('无证据的提案不能创建', async () => {
    const svc = createWorkbenchService();
    const result = await svc.createProposal({
      queue: 'user-demand',
      title: '无证据提案',
      summary: '应当被拒绝',
      priorityBand: 'now',
      evidenceRefs: [],
      actor: 'ai',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('missing-evidence');
  });

  it('证据完整时可直接进入 pending', async () => {
    const svc = createWorkbenchService();
    const result = await svc.createProposal({
      queue: 'user-demand',
      title: '有证据提案',
      summary: '请求决定',
      priorityBand: 'now',
      evidenceRefs: [makeEvidence()],
      requestDecision: true,
      actor: 'ai',
    });
    expect(result.ok).toBe(true);
    expect(result.data?.status).toBe('pending');
  });

  it('只有 unverified 证据不能进入 pending', async () => {
    const svc = createWorkbenchService();
    const result = await svc.createProposal({
      queue: 'user-demand',
      title: '弱证据',
      summary: '请求决定',
      priorityBand: 'now',
      evidenceRefs: [makeEvidence({ qualityStatus: 'unverified' })],
      requestDecision: true,
      actor: 'ai',
    });
    expect(result.ok).toBe(true);
    expect(result.data?.status).toBe('proposal');
  });

  it('没有证据不能请求决定', async () => {
    const svc = createWorkbenchService();
    const created = await svc.createProposal({
      queue: 'user-demand',
      title: '弱证据',
      summary: '请求决定',
      priorityBand: 'now',
      evidenceRefs: [makeEvidence({ qualityStatus: 'unverified' })],
      actor: 'ai',
    });
    const id = created.data!.workItemId;
    const requestResult = await svc.requestDecision(id, 'walker');
    expect(requestResult.ok).toBe(false);
    expect(requestResult.code).toBe('missing-evidence');
  });

  it('接受决定必须带理由，且迁移到 accepted', async () => {
    const svc = createWorkbenchService();
    const created = await svc.createProposal({
      queue: 'walker-thesis',
      title: '决定测试',
      summary: '请求决定',
      priorityBand: 'week',
      evidenceRefs: [makeEvidence()],
      requestDecision: true,
      actor: 'ai',
    });
    const id = created.data!.workItemId;

    const noReason = await svc.decide(id, { outcome: 'accepted', reason: '', actor: 'walker' });
    expect(noReason.code).toBe('invalid-input');

    const accepted = await svc.decide(id, { outcome: 'accepted', reason: '证据充分', actor: 'walker' });
    expect(accepted.ok).toBe(true);
    expect(accepted.data?.status).toBe('accepted');
    expect(accepted.data?.decision.outcome).toBe('accepted');
    expect(accepted.data?.decision.decidedBy).toBe('walker');
  });

  it('只有 accepted 才能创建行动，且行动必须有预期结果', async () => {
    const svc = createWorkbenchService();
    const created = await svc.createProposal({
      queue: 'user-demand',
      title: '行动测试',
      summary: '请求决定',
      priorityBand: 'now',
      evidenceRefs: [makeEvidence()],
      requestDecision: true,
      actor: 'ai',
    });
    const id = created.data!.workItemId;

    // pending 直接创建行动应失败
    const tooEarly = await svc.createAction(id, {
      actionType: 'create-content',
      targetType: 'content',
      expectedOutcome: '产出一篇教程',
      actor: 'walker',
    });
    expect(tooEarly.code).toBe('invalid-transition');

    await svc.decide(id, { outcome: 'accepted', reason: '接受', actor: 'walker' });

    const noOutcome = await svc.createAction(id, {
      actionType: 'create-content',
      targetType: 'content',
      expectedOutcome: '',
      actor: 'walker',
    });
    expect(noOutcome.code).toBe('missing-expected-outcome');

    const action = await svc.createAction(id, {
      actionType: 'create-content',
      targetType: 'content',
      targetId: 'some-slug',
      expectedOutcome: '产出一篇真实教程',
      actor: 'walker',
    });
    expect(action.ok).toBe(true);
    expect(action.data?.status).toBe('acting');
    expect(action.data?.actions).toHaveLength(1);
    expect(action.data?.actions[0].status).toBe('authorized');
  });

  it('没有完成的行动不能记录结果', async () => {
    const svc = createWorkbenchService();
    const created = await svc.createProposal({
      queue: 'user-demand',
      title: '结果测试',
      summary: '请求决定',
      priorityBand: 'now',
      evidenceRefs: [makeEvidence()],
      requestDecision: true,
      actor: 'ai',
    });
    const id = created.data!.workItemId;
    await svc.decide(id, { outcome: 'accepted', reason: '接受', actor: 'walker' });
    const actionRes = await svc.createAction(id, {
      actionType: 'create-content',
      targetType: 'content',
      expectedOutcome: '产出一篇教程',
      actor: 'walker',
    });
    const actionId = actionRes.data!.actions[0].actionId;

    // 行动未完成就记结果 → 失败
    const tooEarly = await svc.recordOutcome(id, {
      actionId,
      result: 'successful',
      summary: '已完成',
      evidenceRefs: [makeEvidence({ sourceType: 'content-feedback' })],
      actor: 'walker',
    });
    expect(tooEarly.code).toBe('invalid-transition');

    // 完成行动 → 进入待验证
    await svc.updateAction(id, actionId, { status: 'completed', actor: 'walker' });

    // 现在可以记结果
    const outcome = await svc.recordOutcome(id, {
      actionId,
      result: 'successful',
      summary: '内容发布后收到正面反馈',
      evidenceRefs: [makeEvidence({ sourceType: 'content-feedback' })],
      actor: 'walker',
      nextDecisionSuggested: false,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.data?.status).toBe('resolved');
    expect(outcome.data?.outcomes).toHaveLength(1);
  });

  it('每次状态变化写一条 append-only history，保留 actor/from/to/reason', async () => {
    const svc = createWorkbenchService();
    const created = await svc.createProposal({
      queue: 'user-demand',
      title: '审计测试',
      summary: '请求决定',
      priorityBand: 'now',
      evidenceRefs: [makeEvidence()],
      requestDecision: true,
      actor: 'ai',
    });
    const id = created.data!.workItemId;

    await svc.decide(id, { outcome: 'accepted', reason: '接受', actor: 'walker' });
    await svc.createAction(id, {
      actionType: 'create-content',
      targetType: 'content',
      expectedOutcome: '产出一篇教程',
      actor: 'walker',
    });

    const final = await svc.findById(id);
    expect(final?.history.length).toBeGreaterThanOrEqual(3);
    const createdEntry = final?.history.find(h => h.kind === 'created');
    expect(createdEntry?.actor).toBe('ai');
    expect(createdEntry?.fromStatus).toBeNull();
    const decisionEntry = final?.history.find(h => h.kind === 'decision-updated');
    expect(decisionEntry?.actor).toBe('walker');
    expect(decisionEntry?.reason).toBe('接受');
  });

  it('拒绝/暂缓保留审计，不删除 WorkItem', async () => {
    const svc = createWorkbenchService();
    const created = await svc.createProposal({
      queue: 'walker-thesis',
      title: '拒绝测试',
      summary: '请求决定',
      priorityBand: 'observe',
      evidenceRefs: [makeEvidence()],
      requestDecision: true,
      actor: 'ai',
    });
    const id = created.data!.workItemId;
    const rejected = await svc.decide(id, { outcome: 'rejected', reason: '证据不足', actor: 'walker' });
    expect(rejected.data?.status).toBe('rejected');
    // 仍可查询（保留审计）
    const stillThere = await svc.findById(id);
    expect(stillThere).not.toBeNull();
  });

  it('非法状态迁移被拒绝（resolved 不能再决定）', async () => {
    const svc = createWorkbenchService();
    const created = await svc.createProposal({
      queue: 'user-demand',
      title: '迁移测试',
      summary: '请求决定',
      priorityBand: 'now',
      evidenceRefs: [makeEvidence()],
      requestDecision: true,
      actor: 'ai',
    });
    const id = created.data!.workItemId;
    await svc.decide(id, { outcome: 'accepted', reason: '接受', actor: 'walker' });
    const actionRes = await svc.createAction(id, {
      actionType: 'create-content',
      targetType: 'content',
      expectedOutcome: '产出一篇教程',
      actor: 'walker',
    });
    const actionId = actionRes.data!.actions[0].actionId;
    await svc.updateAction(id, actionId, { status: 'completed', actor: 'walker' });
    await svc.recordOutcome(id, {
      actionId,
      result: 'successful',
      summary: '完成',
      evidenceRefs: [makeEvidence({ sourceType: 'content-feedback' })],
      actor: 'walker',
    });

    const afterResolved = await svc.decide(id, { outcome: 'accepted', reason: '再次接受', actor: 'walker' });
    expect(afterResolved.ok).toBe(false);
    expect(afterResolved.code).toBe('invalid-transition');
  });

  it('不存在的 ID 返回 not-found', async () => {
    const svc = createWorkbenchService();
    const result = await svc.findById('wi_missing');
    expect(result).toBeNull();
    const decide = await svc.decide('wi_missing', { outcome: 'accepted', reason: 'x', actor: 'walker' });
    expect(decide.code).toBe('not-found');
  });
});

describe('suggestNextAction（P1-E02 结果导向下一步）', () => {
  it('successful → 评估资产候选（不自动注册 Skill）', () => {
    const suggestion = suggestNextAction({ result: 'successful', outcomeSummary: '正面反馈' });
    expect(suggestion).not.toBeNull();
    expect(suggestion!.suggestedActionType).toBe('evaluate-asset');
  });

  it('partial → 按场景拆分内容或补边界（create-content）', () => {
    const suggestion = suggestNextAction({ result: 'partial', outcomeSummary: '部分有效' });
    expect(suggestion!.suggestedActionType).toBe('create-content');
  });

  it('failed → 复核方向，更新或下线（update-content）', () => {
    const suggestion = suggestNextAction({ result: 'failed', outcomeSummary: '未解决' });
    expect(suggestion!.suggestedActionType).toBe('update-content');
  });

  it('inconclusive → 创建 LearningRequest 补证', () => {
    const suggestion = suggestNextAction({ result: 'inconclusive', outcomeSummary: '证据不足' });
    expect(suggestion!.suggestedActionType).toBe('create-learning-request');
  });

  it('建议是纯函数，不自动执行，不写入存储', () => {
    const before = suggestNextAction({ result: 'successful', outcomeSummary: 'x' });
    const after = suggestNextAction({ result: 'successful', outcomeSummary: 'x' });
    expect(before).toEqual(after); // 纯函数，相同输入相同输出
    expect(before!.reason).toBeTruthy();
    expect(before!.suggestedExpectedOutcome).toBeTruthy();
  });
});
