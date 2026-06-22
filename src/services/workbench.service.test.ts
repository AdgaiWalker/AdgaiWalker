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

describe('overridePriority（P1-D02 人工覆盖优先级保存理由与历史）', () => {
  beforeEach(() => __resetMemoryWorkItems());
  afterEach(() => __resetMemoryWorkItems());

  it('覆盖优先级带时保存 from→to 理由到历史，不抹掉原排序依据', async () => {
    const svc = createWorkbenchService();
    const created = await svc.createProposal({
      queue: 'user-demand',
      title: '覆盖测试',
      summary: '请求决定',
      priorityBand: 'week',
      priorityReasons: ['原始排序依据：中频需求'],
      evidenceRefs: [makeEvidence()],
      requestDecision: true,
      actor: 'ai',
    });
    const id = created.data!.workItemId;

    const override = await svc.overridePriority(id, {
      priorityBand: 'now',
      reason: '今天必须处理，用户反复催',
      actor: 'walker',
    });
    expect(override.ok).toBe(true);
    expect(override.data!.priorityBand).toBe('now');
    expect(override.data!.priorityReasons).toContain('原始排序依据：中频需求');
    expect(override.data!.priorityReasons.some(r => r.includes('人工覆盖'))).toBe(true);
    const overrideEntry = override.data!.history.find(h => (h.detail as { override?: boolean })?.override);
    expect(overrideEntry).toBeTruthy();
    expect(overrideEntry!.actor).toBe('walker');
    expect(overrideEntry!.reason).toContain('week → now');
    expect(overrideEntry!.reason).toContain('今天必须处理');
  });

  it('无理由覆盖被拒绝', async () => {
    const svc = createWorkbenchService();
    const created = await svc.createProposal({
      queue: 'user-demand',
      title: '无理由覆盖',
      summary: 'x',
      priorityBand: 'week',
      evidenceRefs: [makeEvidence()],
      actor: 'ai',
    });
    const result = await svc.overridePriority(created.data!.workItemId, {
      priorityBand: 'now',
      reason: '',
      actor: 'walker',
    });
    expect(result.code).toBe('invalid-input');
  });

  it('相同优先级覆盖被拒绝（无变化）', async () => {
    const svc = createWorkbenchService();
    const created = await svc.createProposal({
      queue: 'user-demand',
      title: '同优先级',
      summary: 'x',
      priorityBand: 'week',
      evidenceRefs: [makeEvidence()],
      actor: 'ai',
    });
    const result = await svc.overridePriority(created.data!.workItemId, {
      priorityBand: 'week',
      reason: '重复覆盖',
      actor: 'walker',
    });
    expect(result.code).toBe('invalid-input');
  });
});

describe('WorkbenchService P4 AI proposal 安全护栏', () => {
  beforeEach(() => __resetMemoryWorkItems());
  afterEach(() => __resetMemoryWorkItems());

  it('AI 来源（ai-asset）无证据假设 + now → invalid-input', async () => {
    const svc = createWorkbenchService();
    const result = await svc.createProposal({
      queue: 'ai-asset',
      title: 'AI 草案',
      summary: '无证据假设',
      priorityBand: 'now',
      evidenceRefs: [makeEvidence({ qualityStatus: 'unverified', summary: '弱' })],
      actor: 'ai',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('invalid-input');
  });

  it('AI 来源 + week（非 now）+ 无证据 → 允许创建，但带 expiresAt', async () => {
    const svc = createWorkbenchService();
    const result = await svc.createProposal({
      queue: 'ai-asset',
      title: 'AI 观察',
      summary: '降级到 week',
      priorityBand: 'week',
      evidenceRefs: [makeEvidence({ qualityStatus: 'unverified', summary: '弱' })],
      actor: 'ai',
    });
    expect(result.ok).toBe(true);
    expect(result.data?.expiresAt).toBeTruthy();
    expect(result.data?.status).toBe('proposal');
  });

  it('AI 来源 + now + 充分证据 → 允许，仍带 expiresAt', async () => {
    const svc = createWorkbenchService();
    const result = await svc.createProposal({
      queue: 'ai-asset',
      title: 'AI 强证据',
      summary: '有验证证据',
      priorityBand: 'now',
      evidenceRefs: [makeEvidence()], // verified-source
      actor: 'ai',
    });
    expect(result.ok).toBe(true);
    expect(result.data?.expiresAt).toBeTruthy();
  });

  it('非 AI 来源（user-demand）+ now + 无证据 → 允许（Walker 判断自由），无 expiresAt', async () => {
    const svc = createWorkbenchService();
    const result = await svc.createProposal({
      queue: 'user-demand',
      title: '人的判断',
      summary: 'x',
      priorityBand: 'now',
      evidenceRefs: [makeEvidence({ qualityStatus: 'unverified', summary: '弱' })],
      actor: 'walker',
    });
    expect(result.ok).toBe(true);
    expect(result.data?.expiresAt).toBeUndefined();
  });

  it('getTodayProjection 过滤掉已过期的 AI proposal', async () => {
    const svc = createWorkbenchService();
    const created = await svc.createProposal({
      queue: 'ai-asset',
      title: '将过期',
      summary: 'x',
      priorityBand: 'week',
      evidenceRefs: [makeEvidence({ qualityStatus: 'unverified', summary: '弱' })],
      actor: 'ai',
    });
    expect(created.data?.expiresAt).toBeTruthy();
    // 直接改内存里的 expiresAt 为过去，模拟过期
    const item = created.data!;
    const past = '2020-01-01T00:00:00.000Z';
    const expired = { ...item, expiresAt: past };
    const { saveWorkItem } = await import('@/conversation/store');
    await saveWorkItem(expired);

    const projection = await svc.getTodayProjection();
    expect(projection.find(w => w.workItemId === item.workItemId)).toBeUndefined();
  });

  it('overridePriority 把 AI 无证据假设覆盖到 now → 拒绝', async () => {
    const svc = createWorkbenchService();
    const created = await svc.createProposal({
      queue: 'ai-asset',
      title: 'AI 草案',
      summary: 'x',
      priorityBand: 'observe',
      evidenceRefs: [makeEvidence({ qualityStatus: 'unverified', summary: '弱' })],
      actor: 'ai',
    });
    const result = await svc.overridePriority(created.data!.workItemId, {
      priorityBand: 'now',
      reason: '想提升',
      actor: 'walker',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('invalid-input');
  });
});

describe('WorkbenchService 安全网（domain 剥离前行为固化）', () => {
  beforeEach(() => __resetMemoryWorkItems());
  afterEach(() => __resetMemoryWorkItems());

  it('requestDecision happy path：proposal(证据完整)→ pending，写一条 proposal→pending 历史', async () => {
    const svc = createWorkbenchService();
    // 证据完整但不 requestDecision，确保初始状态停在 proposal（而非直接 pending）
    const created = await svc.createProposal({
      queue: 'user-demand',
      title: 'requestDecision happy',
      summary: '稍后请求决定',
      priorityBand: 'week',
      evidenceRefs: [makeEvidence()],
      actor: 'ai',
    });
    expect(created.data?.status).toBe('proposal');
    const id = created.data!.workItemId;

    const result = await svc.requestDecision(id, 'walker');
    expect(result.ok).toBe(true);
    expect(result.data?.status).toBe('pending');
    expect(result.data?.decision.outcome).toBe('pending');

    // 末条历史应是 proposal→pending 的 status-change，理由来自 requestDecision 内固定文案
    const final = await svc.findById(id);
    const lastEntry = final?.history[final.history.length - 1];
    expect(lastEntry?.kind).toBe('status-change');
    expect(lastEntry?.fromStatus).toBe('proposal');
    expect(lastEntry?.toStatus).toBe('pending');
    expect(lastEntry?.actor).toBe('walker');
    expect(lastEntry?.reason).toBe('请求 Walker 决定');
  });

  it('decide 从 paused 出发：paused→accepted 被 ALLOWED_TRANSITIONS 拒绝（invalid-transition）', async () => {
    const svc = createWorkbenchService();
    const created = await svc.createProposal({
      queue: 'user-demand',
      title: 'paused 出发',
      summary: '先暂缓再尝试接受',
      priorityBand: 'week',
      evidenceRefs: [makeEvidence()],
      actor: 'ai',
    });
    const id = created.data!.workItemId;

    // proposal → paused（outcome=paused，在白名单 proposal→paused 内）
    const paused = await svc.decide(id, { outcome: 'paused', reason: '先放一放', actor: 'walker' });
    expect(paused.data?.status).toBe('paused');

    // ALLOWED_TRANSITIONS.paused = ['pending','proposal','rejected']，不含 accepted
    const accepted = await svc.decide(id, { outcome: 'accepted', reason: '现在想接受', actor: 'walker' });
    expect(accepted.ok).toBe(false);
    expect(accepted.code).toBe('invalid-transition');
  });

  it('decide 从 proposal 出发：proposal→accepted 允许（证据完整时）', async () => {
    const svc = createWorkbenchService();
    const created = await svc.createProposal({
      queue: 'user-demand',
      title: 'proposal 直接受',
      summary: '不经过 pending 直接 decide',
      priorityBand: 'now',
      evidenceRefs: [makeEvidence()],
      actor: 'ai',
    });
    expect(created.data?.status).toBe('proposal');
    const id = created.data!.workItemId;

    const accepted = await svc.decide(id, { outcome: 'accepted', reason: '证据充分直接接受', actor: 'walker' });
    expect(accepted.ok).toBe(true);
    expect(accepted.data?.status).toBe('accepted');
    expect(accepted.data?.decision.outcome).toBe('accepted');
    expect(accepted.data?.decision.decidedBy).toBe('walker');
    // 这条历史应是 decision-updated：proposal→accepted
    const entry = accepted.data?.history[accepted.data!.history.length - 1];
    expect(entry?.kind).toBe('decision-updated');
    expect(entry?.fromStatus).toBe('proposal');
    expect(entry?.toStatus).toBe('accepted');
  });

  it('updateAction 非 completed 路径：不推 WorkItem 状态，只记 action-updated 历史', async () => {
    const svc = createWorkbenchService();
    const created = await svc.createProposal({
      queue: 'user-demand',
      title: 'updateAction 非 completed',
      summary: '行动状态流转',
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
    // createAction 后 WorkItem=acting，action.status=authorized
    expect(actionRes.data?.status).toBe('acting');
    expect(actionRes.data?.actions[0].status).toBe('authorized');

    // authorized → in-progress：WorkItem 仍应停留在 acting（不变）
    const toInProgress = await svc.updateAction(id, actionId, {
      status: 'in-progress',
      actor: 'walker',
      reason: '开始动笔',
    });
    expect(toInProgress.ok).toBe(true);
    expect(toInProgress.data?.status).toBe('acting');
    expect(toInProgress.data?.actions[0].status).toBe('in-progress');
    const lastInProgress = toInProgress.data?.history[toInProgress.data!.history.length - 1];
    expect(lastInProgress?.kind).toBe('action-updated');
    expect((lastInProgress?.detail as { from?: string; to?: string })?.from).toBe('authorized');
    expect((lastInProgress?.detail as { from?: string; to?: string })?.to).toBe('in-progress');

    // in-progress → blocked：WorkItem 仍是 acting
    const toBlocked = await svc.updateAction(id, actionId, {
      status: 'blocked',
      actor: 'walker',
      reason: '卡在素材不足',
    });
    expect(toBlocked.ok).toBe(true);
    expect(toBlocked.data?.status).toBe('acting');
    expect(toBlocked.data?.actions[0].status).toBe('blocked');
    const lastBlocked = toBlocked.data?.history[toBlocked.data!.history.length - 1];
    expect(lastBlocked?.kind).toBe('action-updated');

    // blocked → cancelled：WorkItem 仍是 acting（cancelled 不推 WorkItem 状态）
    const toCancelled = await svc.updateAction(id, actionId, {
      status: 'cancelled',
      actor: 'walker',
      reason: '放弃此行动',
    });
    expect(toCancelled.ok).toBe(true);
    expect(toCancelled.data?.status).toBe('acting');
    expect(toCancelled.data?.actions[0].status).toBe('cancelled');
    const lastCancelled = toCancelled.data?.history[toCancelled.data!.history.length - 1];
    expect(lastCancelled?.kind).toBe('action-updated');

    // 全程没有出现 awaiting-verification 这个 status-change（那是 completed 专属）
    const final = await svc.findById(id);
    const awaitEntry = final?.history.find(h => h.toStatus === 'awaiting-verification');
    expect(awaitEntry).toBeUndefined();
  });

  it('updateAction actionId 不存在 → not-found', async () => {
    const svc = createWorkbenchService();
    const created = await svc.createProposal({
      queue: 'user-demand',
      title: 'updateAction not-found',
      summary: '行动不存在',
      priorityBand: 'now',
      evidenceRefs: [makeEvidence()],
      requestDecision: true,
      actor: 'ai',
    });
    const id = created.data!.workItemId;
    await svc.decide(id, { outcome: 'accepted', reason: '接受', actor: 'walker' });

    const result = await svc.updateAction(id, 'wa_missing', {
      status: 'in-progress',
      actor: 'walker',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('not-found');
  });
});

describe('WorkbenchService.list 默认过滤过期 proposal（BUG #3 修复）', () => {
  beforeEach(() => __resetMemoryWorkItems());
  afterEach(() => __resetMemoryWorkItems());

  /** 直接改内存里的 expiresAt 为过去，模拟过期 proposal（沿用 getTodayProjection 测试手法） */
  async function expireInMemory(workItemId: string): Promise<void> {
    const { listWorkItems, saveWorkItem } = await import('@/conversation/store');
    const items = await listWorkItems();
    const target = items.find(w => w.workItemId === workItemId);
    if (target) {
      await saveWorkItem({ ...target, expiresAt: '2020-01-01T00:00:00.000Z' });
    }
  }

  it('默认过滤掉已过期的 proposal（与 getTodayProjection 行为一致）', async () => {
    const svc = createWorkbenchService();
    // 1. 过期的 AI proposal（queue=ai-asset 写入 expiresAt）
    const expired = await svc.createProposal({
      queue: 'ai-asset',
      title: '过期 AI 提案',
      summary: '已过期应被默认过滤',
      priorityBand: 'week',
      evidenceRefs: [makeEvidence({ qualityStatus: 'unverified', summary: '弱' })],
      actor: 'ai',
    });
    expect(expired.data?.expiresAt).toBeTruthy();
    await expireInMemory(expired.data!.workItemId);

    // 2. 未过期的 proposal（user-demand 无 expiresAt）
    const active = await svc.createProposal({
      queue: 'user-demand',
      title: '活跃提案',
      summary: '应保留',
      priorityBand: 'now',
      evidenceRefs: [makeEvidence()],
      actor: 'ai',
    });

    const items = await svc.list();
    const ids = items.map(w => w.workItemId);
    expect(ids).toContain(active.data!.workItemId);
    expect(ids).not.toContain(expired.data!.workItemId); // 过期被过滤
  });

  it('includeExpiredProposals:true 返回全部（审计场景）', async () => {
    const svc = createWorkbenchService();
    const expired = await svc.createProposal({
      queue: 'ai-asset',
      title: '过期 AI 提案',
      summary: '审计场景应可见',
      priorityBand: 'week',
      evidenceRefs: [makeEvidence({ qualityStatus: 'unverified', summary: '弱' })],
      actor: 'ai',
    });
    await expireInMemory(expired.data!.workItemId);

    const active = await svc.createProposal({
      queue: 'user-demand',
      title: '活跃提案',
      summary: '应保留',
      priorityBand: 'now',
      evidenceRefs: [makeEvidence()],
      actor: 'ai',
    });

    const items = await svc.list({ includeExpiredProposals: true });
    const ids = items.map(w => w.workItemId);
    expect(ids).toContain(active.data!.workItemId);
    expect(ids).toContain(expired.data!.workItemId); // 审计场景可见
  });

  it('list 带过滤参数时仍过滤过期 proposal（组合不破坏默认）', async () => {
    const svc = createWorkbenchService();
    const expired = await svc.createProposal({
      queue: 'ai-asset',
      title: '过期 AI 提案',
      summary: 'x',
      priorityBand: 'week',
      evidenceRefs: [makeEvidence({ qualityStatus: 'unverified', summary: '弱' })],
      actor: 'ai',
    });
    await expireInMemory(expired.data!.workItemId);

    // 按 status=proposal 过滤，过期项仍应被默认过滤掉
    const items = await svc.list({ status: 'proposal' });
    expect(items.find(w => w.workItemId === expired.data!.workItemId)).toBeUndefined();
  });
});
