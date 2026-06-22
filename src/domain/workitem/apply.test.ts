/**
 * apply.test.ts —— Task 3 apply 函数单测
 *
 * 覆盖矩阵（Agent B 指出的盲点必须断言 history 值正确性）：
 * - 每函数 happy path：断言完整 WorkItem 结构 + history 的 fromStatus/toStatus/kind 值
 * - 每个信任边界失败 code
 * - 每个迁移的 canTransition 拒绝路径（非法 from→to）
 * - createProposal decision 字段值（清理后的合理值）
 *
 * 确定性 deps：clock 返回固定 ISO，idGen 返回固定前缀串（使历史完全可重放）。
 */

import { describe, expect, it } from 'vitest';

import {
  applyCreateAction,
  applyCreateProposal,
  applyDecide,
  applyRequestDecision,
} from './apply';

import type { WorkItemDeps } from './types';
import type {
  EvidenceRef,
  WorkItem,
  WorkItemHistoryEntry,
} from '@/stores/ports';

// ---------------------------------------------------------------------------
// 确定性 deps 工厂
// ---------------------------------------------------------------------------

const FIXED_NOW = '2026-01-01T00:00:00.000Z';
/** AI proposal 14 天后的过期时间（addDaysIso 基于入参计算） */
const AI_EXPIRES_AT = '2026-01-15T00:00:00.000Z';

function makeDeps(over: Partial<WorkItemDeps> = {}): WorkItemDeps {
  return {
    clock: { now: () => FIXED_NOW },
    idGen: {
      workItemId: () => 'wi_fixed',
      historyId: () => 'wh_fixed',
      actionId: () => 'wa_fixed',
      outcomeId: () => 'wo_fixed',
    },
    ...over,
  };
}

/** 累加式 idGen：每次调用返回不同的递增 ID，便于断言多条 history 的 id 不同。*/
function makeSequentialIdGen(): WorkItemDeps['idGen'] {
  let n = 0;
  const next = (prefix: string) => `${prefix}_${++n}`;
  return {
    workItemId: () => next('wi'),
    historyId: () => next('wh'),
    actionId: () => next('wa'),
    outcomeId: () => next('wo'),
  };
}

function makeDepsSequential(): WorkItemDeps {
  return { clock: { now: () => FIXED_NOW }, idGen: makeSequentialIdGen() };
}

function makeEvidence(over: Partial<EvidenceRef> = {}): EvidenceRef {
  return {
    evidenceId: 'ev_1',
    sourceType: 'need-case',
    sourceId: 'nc_test',
    occurredAt: '2026-06-20T00:00:00.000Z',
    collectedAt: '2026-06-20T00:00:00.000Z',
    environment: 'development',
    visibility: 'owner',
    freshness: 'fresh',
    qualityStatus: 'verified-source',
    summary: '一条可信证据',
    ...over,
  };
}

/** 构造一个基础 proposal（供 requestDecision/decide/createAction 测试复用）。*/
function makeProposalWorkItem(over: Partial<WorkItem> = {}): WorkItem {
  return {
    workItemId: 'wi_existing',
    queue: 'user-demand',
    title: '既有提案',
    summary: '既有摘要',
    status: 'proposal',
    priorityBand: 'now',
    priorityReasons: [],
    uncertainty: [],
    evidenceRefs: [makeEvidence()],
    decision: { requestedDecision: '既有摘要', outcome: 'pending' },
    actions: [],
    outcomes: [],
    history: [],
    createdAt: '2025-12-31T00:00:00.000Z',
    updatedAt: '2025-12-31T00:00:00.000Z',
    ...over,
  };
}

// ===========================================================================
// applyCreateProposal
// ===========================================================================

describe('applyCreateProposal', () => {
  describe('happy path', () => {
    it('证据完整 + requestDecision → 初始 pending，history 写 created + status-change 两条', () => {
      const deps = makeDepsSequential();
      const result = applyCreateProposal(
        {
          queue: 'user-demand',
          title: '有证据提案',
          summary: '请求决定',
          priorityBand: 'now',
          evidenceRefs: [makeEvidence()],
          requestDecision: true,
          actor: 'ai',
        },
        deps,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const w = result.workItem;
      // 完整结构断言
      expect(w.workItemId).toBe('wi_1');
      expect(w.queue).toBe('user-demand');
      expect(w.title).toBe('有证据提案');
      expect(w.summary).toBe('请求决定');
      expect(w.status).toBe('pending');
      expect(w.priorityBand).toBe('now');
      expect(w.priorityReasons).toEqual([]);
      expect(w.uncertainty).toEqual([]);
      expect(w.actions).toEqual([]);
      expect(w.outcomes).toEqual([]);
      expect(w.topicId).toBeUndefined();
      expect(w.expiresAt).toBeUndefined(); // 非 ai-asset 不写过期
      expect(w.createdAt).toBe(FIXED_NOW);
      expect(w.updatedAt).toBe(FIXED_NOW);

      // decision 清理后的合理值（不再复制 service L132-134 死代码）
      expect(w.decision).toEqual({ requestedDecision: '请求决定', outcome: 'pending' });

      // history 两条：created（fromStatus=null → pending）+ status-change（proposal → pending）
      expect(w.history).toHaveLength(2);

      const created = w.history[0]!;
      expect(created.historyId).toBe('wh_2'); // workItemId=wi_1 先消耗，historyId 从 wh_2 起
      expect(created.fromStatus).toBeNull();
      expect(created.toStatus).toBe('pending');
      expect(created.actor).toBe('ai');
      expect(created.reason).toBe('创建工作项');
      expect(created.kind).toBe('created');
      expect(created.occurredAt).toBe(FIXED_NOW);
      expect(created.detail).toEqual({ queue: 'user-demand', evidenceCount: 1 });

      const statusChange = w.history[1]!;
      expect(statusChange.historyId).toBe('wh_3');
      expect(statusChange.fromStatus).toBe('proposal'); // 字面量 'proposal'，不回溯
      expect(statusChange.toStatus).toBe('pending');
      expect(statusChange.kind).toBe('status-change');
      expect(statusChange.reason).toBe('证据完整，请求决定');
    });

    it('弱证据（unverified）即使 requestDecision 也只停在 proposal', () => {
      const result = applyCreateProposal(
        {
          queue: 'user-demand',
          title: '弱证据',
          summary: 'x',
          priorityBand: 'now',
          evidenceRefs: [makeEvidence({ qualityStatus: 'unverified' })],
          requestDecision: true,
          actor: 'ai',
        },
        makeDeps(),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.workItem.status).toBe('proposal');
      // 只写 created 一条（无 status-change）
      expect(result.workItem.history).toHaveLength(1);
      expect(result.workItem.history[0]!.kind).toBe('created');
      expect(result.workItem.history[0]!.fromStatus).toBeNull();
      expect(result.workItem.history[0]!.toStatus).toBe('proposal');
    });

    it('不传 requestDecision → 初始 proposal，只写 created 一条', () => {
      const result = applyCreateProposal(
        {
          queue: 'user-demand',
          title: '默认提案',
          summary: 'x',
          priorityBand: 'now',
          evidenceRefs: [makeEvidence()],
          actor: 'walker',
        },
        makeDeps(),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.workItem.status).toBe('proposal');
      expect(result.workItem.history).toHaveLength(1);
      expect(result.workItem.history[0]!.kind).toBe('created');
    });

    it('ai-asset 队列写 14 天后过期时间', () => {
      const result = applyCreateProposal(
        {
          queue: 'ai-asset',
          title: 'AI 草案',
          summary: 'x',
          priorityBand: 'week',
          evidenceRefs: [makeEvidence()],
          actor: 'ai',
        },
        makeDeps(),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.workItem.expiresAt).toBe(AI_EXPIRES_AT);
    });

    it('可选字段 priorityReasons / uncertainty / topicId 透传到 WorkItem', () => {
      const result = applyCreateProposal(
        {
          queue: 'walker-thesis',
          title: 'x',
          summary: 'y',
          priorityBand: 'week',
          priorityReasons: ['排序理由 A'],
          uncertainty: ['不确定项 B'],
          evidenceRefs: [makeEvidence()],
          topicId: 'topic_42',
          actor: 'walker',
        },
        makeDeps(),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.workItem.priorityReasons).toEqual(['排序理由 A']);
      expect(result.workItem.uncertainty).toEqual(['不确定项 B']);
      expect(result.workItem.topicId).toBe('topic_42');
    });

    it('title/summary 前后空白被 trim；decision.requestedDecision 保留原 summary（与 service 行为一致）', () => {
      const result = applyCreateProposal(
        {
          queue: 'user-demand',
          title: '  有标题  ',
          summary: '  摘要  ',
          priorityBand: 'now',
          evidenceRefs: [makeEvidence()],
          actor: 'ai',
        },
        makeDeps(),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.workItem.title).toBe('有标题');
      expect(result.workItem.summary).toBe('摘要');
      // decision.requestedDecision 用原 summary（service L133 也用 input.summary，非 trim 后）；
      // 这里断言"清理后的合理值"为 { requestedDecision: input.summary, outcome: 'pending' }。
      expect(result.workItem.decision.requestedDecision).toBe('  摘要  ');
      expect(result.workItem.decision.outcome).toBe('pending');
    });
  });

  describe('信任边界失败', () => {
    it('title 空 → invalid-input', () => {
      const result = applyCreateProposal(
        {
          queue: 'user-demand',
          title: '   ',
          summary: 'x',
          priorityBand: 'now',
          evidenceRefs: [makeEvidence()],
          actor: 'ai',
        },
        makeDeps(),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('invalid-input');
      expect(result.message).toContain('标题');
    });

    it('evidenceRefs 空数组 → missing-evidence', () => {
      const result = applyCreateProposal(
        {
          queue: 'user-demand',
          title: 'x',
          summary: 'y',
          priorityBand: 'now',
          evidenceRefs: [],
          actor: 'ai',
        },
        makeDeps(),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('missing-evidence');
    });

    it('AI + now + 无证据 → invalid-input（P4 安全护栏）', () => {
      const result = applyCreateProposal(
        {
          queue: 'ai-asset',
          title: 'AI 假设',
          summary: 'y',
          priorityBand: 'now',
          evidenceRefs: [makeEvidence({ qualityStatus: 'unverified' })],
          actor: 'ai',
        },
        makeDeps(),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('invalid-input');
      expect(result.message).toContain('立即处理');
    });

    it('AI + now + 有证据 → 通过（护栏不误伤有证据的 AI 草案）', () => {
      const result = applyCreateProposal(
        {
          queue: 'ai-asset',
          title: 'AI 有证据',
          summary: 'y',
          priorityBand: 'now',
          evidenceRefs: [makeEvidence()],
          actor: 'ai',
        },
        makeDeps(),
      );
      expect(result.ok).toBe(true);
    });

    it('AI + week + 无证据 → 通过（非 now 优先级不受护栏）', () => {
      const result = applyCreateProposal(
        {
          queue: 'ai-asset',
          title: 'AI 低优',
          summary: 'y',
          priorityBand: 'week',
          evidenceRefs: [makeEvidence({ qualityStatus: 'unverified' })],
          actor: 'ai',
        },
        makeDeps(),
      );
      expect(result.ok).toBe(true);
    });
  });

  it('纯函数：不修改入参 input（不可变风格）', () => {
    const input = {
      queue: 'user-demand' as const,
      title: 'x',
      summary: 'y',
      priorityBand: 'now' as const,
      evidenceRefs: [makeEvidence()],
      actor: 'ai',
    };
    const snapshot = { ...input, evidenceRefs: [...input.evidenceRefs] };
    applyCreateProposal(input, makeDeps());
    expect(input).toEqual(snapshot);
  });
});

// ===========================================================================
// applyRequestDecision
// ===========================================================================

describe('applyRequestDecision', () => {
  describe('happy path', () => {
    it('proposal + 有证据 → pending，写一条 status-change（fromStatus=proposal）', () => {
      const item = makeProposalWorkItem({ status: 'proposal' });
      const result = applyRequestDecision(item, 'walker', makeDeps());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const w = result.workItem;
      expect(w.status).toBe('pending');
      expect(w.decision.outcome).toBe('pending');
      expect(w.updatedAt).toBe(FIXED_NOW);
      expect(w.history).toHaveLength(1);

      const entry = w.history[0]!;
      expect(entry.historyId).toBe('wh_fixed');
      expect(entry.fromStatus).toBe('proposal'); // 迁移前真实状态
      expect(entry.toStatus).toBe('pending');
      expect(entry.actor).toBe('walker');
      expect(entry.reason).toBe('请求 Walker 决定');
      expect(entry.kind).toBe('status-change');
      expect(entry.occurredAt).toBe(FIXED_NOW);
    });

    it('paused → pending 合法迁移', () => {
      const item = makeProposalWorkItem({ status: 'paused' });
      const result = applyRequestDecision(item, 'walker', makeDeps());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.workItem.status).toBe('pending');
      expect(result.workItem.history[0]!.fromStatus).toBe('paused');
      expect(result.workItem.history[0]!.toStatus).toBe('pending');
    });
  });

  describe('信任边界失败', () => {
    it('证据不足 → missing-evidence', () => {
      const item = makeProposalWorkItem({
        evidenceRefs: [makeEvidence({ qualityStatus: 'unverified' })],
      });
      const result = applyRequestDecision(item, 'walker', makeDeps());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('missing-evidence');
    });

    it('from=accepted → invalid-transition（accepted 不能回 pending）', () => {
      const item = makeProposalWorkItem({ status: 'accepted' });
      const result = applyRequestDecision(item, 'walker', makeDeps());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('invalid-transition');
      expect(result.message).toContain('accepted');
    });

    it('from=acting → invalid-transition', () => {
      const item = makeProposalWorkItem({ status: 'acting' });
      const result = applyRequestDecision(item, 'walker', makeDeps());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('invalid-transition');
    });

    it('from=resolved（终态） → invalid-transition', () => {
      const item = makeProposalWorkItem({ status: 'resolved' });
      const result = applyRequestDecision(item, 'walker', makeDeps());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('invalid-transition');
    });
  });

  it('纯函数：不修改入参 current（不可变风格）', () => {
    const item = makeProposalWorkItem({ status: 'proposal' });
    const historySnapshot = [...item.history];
    const statusSnapshot = item.status;
    applyRequestDecision(item, 'walker', makeDeps());
    expect(item.status).toBe(statusSnapshot);
    expect(item.history).toEqual(historySnapshot);
  });
});

// ===========================================================================
// applyDecide
// ===========================================================================

describe('applyDecide', () => {
  describe('happy path', () => {
    it('pending + accepted → 写 decision-updated（fromStatus=pending），decision 字段全量更新', () => {
      const item = makeProposalWorkItem({
        status: 'pending',
        decision: { requestedDecision: 'x', outcome: 'pending' },
      });
      const result = applyDecide(
        item,
        { outcome: 'accepted', reason: '证据充分', actor: 'walker' },
        makeDeps(),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const w = result.workItem;
      expect(w.status).toBe('accepted');
      expect(w.decision).toEqual({
        requestedDecision: 'x',
        outcome: 'accepted',
        reason: '证据充分',
        decidedBy: 'walker',
        decidedAt: FIXED_NOW,
      });
      expect(w.history).toHaveLength(1);

      const entry = w.history[0]!;
      expect(entry.historyId).toBe('wh_fixed');
      expect(entry.fromStatus).toBe('pending'); // 迁移前真实状态
      expect(entry.toStatus).toBe('accepted');
      expect(entry.kind).toBe('decision-updated');
      expect(entry.reason).toBe('证据充分');
      expect(entry.actor).toBe('walker');
      expect(entry.detail).toEqual({ decision: 'accepted' });
      expect(entry.occurredAt).toBe(FIXED_NOW);
    });

    it('proposal + rejected → 写 decision-updated（fromStatus=proposal）', () => {
      const item = makeProposalWorkItem({ status: 'proposal' });
      const result = applyDecide(
        item,
        { outcome: 'rejected', reason: '方向不对', actor: 'walker' },
        makeDeps(),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.workItem.status).toBe('rejected');
      expect(result.workItem.history[0]!.fromStatus).toBe('proposal');
      expect(result.workItem.history[0]!.toStatus).toBe('rejected');
      expect(result.workItem.history[0]!.kind).toBe('decision-updated');
    });

    it('paused + rejected → 写 decision-updated（fromStatus=paused，合法迁移）', () => {
      const item = makeProposalWorkItem({ status: 'paused' });
      const result = applyDecide(
        item,
        { outcome: 'rejected', reason: '不再考虑', actor: 'walker' },
        makeDeps(),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.workItem.status).toBe('rejected');
      expect(result.workItem.history[0]!.fromStatus).toBe('paused');
      expect(result.workItem.history[0]!.toStatus).toBe('rejected');
      expect(result.workItem.history[0]!.kind).toBe('decision-updated');
    });

    it('pending + accepted 但证据不足 → missing-evidence（target=accepted 证据校验）', () => {
      const item = makeProposalWorkItem({
        status: 'pending',
        evidenceRefs: [makeEvidence({ qualityStatus: 'unverified' })],
      });
      const result = applyDecide(
        item,
        { outcome: 'accepted', reason: '接受', actor: 'walker' },
        makeDeps(),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('missing-evidence');
    });
  });

  describe('信任边界失败', () => {
    it('reason 空 → invalid-input', () => {
      const item = makeProposalWorkItem({ status: 'pending' });
      const result = applyDecide(
        item,
        { outcome: 'accepted', reason: '   ', actor: 'walker' },
        makeDeps(),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('invalid-input');
    });

    it('from=accepted → invalid-transition（语义前置守卫：accepted 不能再决定）', () => {
      const item = makeProposalWorkItem({ status: 'accepted' });
      const result = applyDecide(
        item,
        { outcome: 'paused', reason: 'x', actor: 'walker' },
        makeDeps(),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('invalid-transition');
      expect(result.message).toContain('accepted');
    });

    it('from=acting → invalid-transition', () => {
      const item = makeProposalWorkItem({ status: 'acting' });
      const result = applyDecide(
        item,
        { outcome: 'paused', reason: 'x', actor: 'walker' },
        makeDeps(),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('invalid-transition');
    });

    it('from=resolved（终态） → invalid-transition', () => {
      const item = makeProposalWorkItem({ status: 'resolved' });
      const result = applyDecide(
        item,
        { outcome: 'rejected', reason: 'x', actor: 'walker' },
        makeDeps(),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('invalid-transition');
    });

    it('paused + paused（暂缓自身） → invalid-transition（canTransition 拒绝自迁移）', () => {
      // 白名单不含 paused→paused（自身迁移一律非法）
      const item = makeProposalWorkItem({ status: 'paused' });
      const result = applyDecide(
        item,
        { outcome: 'paused', reason: '再观察', actor: 'walker' },
        makeDeps(),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('invalid-transition');
    });
  });

  it('纯函数：不修改入参 current', () => {
    const item = makeProposalWorkItem({ status: 'pending' });
    const statusSnapshot = item.status;
    const decisionSnapshot = { ...item.decision };
    applyDecide(item, { outcome: 'accepted', reason: 'x', actor: 'walker' }, makeDeps());
    expect(item.status).toBe(statusSnapshot);
    expect(item.decision).toEqual(decisionSnapshot);
  });
});

// ===========================================================================
// applyCreateAction
// ===========================================================================

describe('applyCreateAction', () => {
  const baseActionInput = {
    actionType: 'create-content' as const,
    targetType: 'content',
    targetId: 'slug-1',
    expectedOutcome: '产出一篇指南',
    actor: 'walker',
  };

  describe('happy path', () => {
    it('accepted → acting：写 status-change + action-added 两条，action 字段完整', () => {
      const deps = makeDepsSequential();
      const item = makeProposalWorkItem({ status: 'accepted' });
      const result = applyCreateAction(item, baseActionInput, deps);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const w = result.workItem;
      // 状态迁移 accepted → acting（BUG #4：canTransition('accepted','acting') 合法）
      expect(w.status).toBe('acting');
      expect(w.updatedAt).toBe(FIXED_NOW);

      // action 字段完整断言
      expect(w.actions).toHaveLength(1);
      const action = w.actions[0]!;
      expect(action.actionId).toBe('wa_1');
      expect(action.actionType).toBe('create-content');
      expect(action.targetType).toBe('content');
      expect(action.targetId).toBe('slug-1');
      expect(action.assignee).toBe('walker');
      expect(action.status).toBe('authorized');
      expect(action.expectedOutcome).toBe('产出一篇指南');
      expect(action.reversible).toBe(true);
      expect(action.createdAt).toBe(FIXED_NOW);
      expect(action.updatedAt).toBe(FIXED_NOW);

      // history 两条：status-change（fromStatus=accepted → acting）+ action-added
      expect(w.history).toHaveLength(2);

      const statusChange = w.history[0]!;
      // 顺序：actionId 先消耗 wa_1(n=1)，status-change 的 historyId wh_2(n=2)，action-added wh_3(n=3)
      expect(statusChange.historyId).toBe('wh_2');
      expect(statusChange.fromStatus).toBe('accepted'); // 迁移前真实状态
      expect(statusChange.toStatus).toBe('acting');
      expect(statusChange.kind).toBe('status-change');
      expect(statusChange.reason).toContain('create-content');
      expect(statusChange.actor).toBe('walker');

      const actionAdded = w.history[1]!;
      expect(actionAdded.historyId).toBe('wh_3');
      // action-added 的 fromStatus/toStatus 用迁移完成后的状态（对照 service L297-304）
      expect(actionAdded.fromStatus).toBe('acting');
      expect(actionAdded.toStatus).toBe('acting');
      expect(actionAdded.kind).toBe('action-added');
      expect(actionAdded.detail).toEqual({ actionId: 'wa_1', actionType: 'create-content' });
    });

    it('acting（追加第二个行动）：不触发状态迁移，只写 action-added 一条', () => {
      const deps = makeDepsSequential();
      const item = makeProposalWorkItem({
        status: 'acting',
        actions: [
          {
            actionId: 'wa_existing',
            actionType: 'create-content',
            targetType: 'content',
            assignee: 'walker',
            status: 'authorized',
            expectedOutcome: 'x',
            reversible: true,
            createdAt: FIXED_NOW,
            updatedAt: FIXED_NOW,
          },
        ],
      });
      const result = applyCreateAction(item, baseActionInput, deps);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const w = result.workItem;
      expect(w.status).toBe('acting'); // 无变化
      expect(w.actions).toHaveLength(2);

      // 只写 action-added 一条（无 status-change）
      expect(w.history).toHaveLength(1);
      const entry = w.history[0]!;
      expect(entry.kind).toBe('action-added');
      expect(entry.fromStatus).toBe('acting');
      expect(entry.toStatus).toBe('acting');
    });

    it('assignee 默认 walker，reversible 默认 true，expectedOutcome 被 trim', () => {
      const item = makeProposalWorkItem({ status: 'accepted' });
      const result = applyCreateAction(
        item,
        {
          actionType: 'review-incident',
          targetType: 'incident',
          expectedOutcome: '  复盘结论  ',
          actor: 'walker',
        },
        makeDeps(),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const action = result.workItem.actions[0]!;
      expect(action.assignee).toBe('walker');
      expect(action.reversible).toBe(true);
      expect(action.expectedOutcome).toBe('复盘结论');
    });

    it('verifyAt / rollbackPlan / reversible=false / assignee=ai 透传', () => {
      const item = makeProposalWorkItem({ status: 'accepted' });
      const result = applyCreateAction(
        item,
        {
          actionType: 'change-feature',
          targetType: 'feature',
          targetId: 'feat-x',
          assignee: 'ai',
          expectedOutcome: 'x',
          verifyAt: '2026-02-01T00:00:00.000Z',
          reversible: false,
          rollbackPlan: '回滚到 v1',
          actor: 'walker',
        },
        makeDeps(),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const action = result.workItem.actions[0]!;
      expect(action.assignee).toBe('ai');
      expect(action.verifyAt).toBe('2026-02-01T00:00:00.000Z');
      expect(action.reversible).toBe(false);
      expect(action.rollbackPlan).toBe('回滚到 v1');
      expect(action.targetId).toBe('feat-x');
    });
  });

  describe('信任边界失败', () => {
    it('from=proposal → invalid-transition（只有 accepted/acting 能创建行动）', () => {
      const item = makeProposalWorkItem({ status: 'proposal' });
      const result = applyCreateAction(item, baseActionInput, makeDeps());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('invalid-transition');
      expect(result.message).toContain('接受');
    });

    it('from=pending → invalid-transition', () => {
      const item = makeProposalWorkItem({ status: 'pending' });
      const result = applyCreateAction(item, baseActionInput, makeDeps());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('invalid-transition');
    });

    it('from=resolved（终态） → invalid-transition', () => {
      const item = makeProposalWorkItem({ status: 'resolved' });
      const result = applyCreateAction(item, baseActionInput, makeDeps());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('invalid-transition');
    });

    it('expectedOutcome 空 → missing-expected-outcome', () => {
      const item = makeProposalWorkItem({ status: 'accepted' });
      const result = applyCreateAction(
        item,
        { ...baseActionInput, expectedOutcome: '   ' },
        makeDeps(),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('missing-expected-outcome');
      expect(result.message).toContain('预期结果');
    });
  });

  it('纯函数：不修改入参 current（actions / history 都不 mutate 原数组）', () => {
    const item = makeProposalWorkItem({ status: 'accepted' });
    const actionsSnapshot = [...item.actions];
    const historySnapshot = [...item.history];
    applyCreateAction(item, baseActionInput, makeDeps());
    expect(item.actions).toEqual(actionsSnapshot);
    expect(item.history).toEqual(historySnapshot);
    expect(item.status).toBe('accepted');
  });
});

// ===========================================================================
// 跨函数：history fromStatus 真实性（Agent B 盲点专项）
// ===========================================================================

describe('history fromStatus 真实性（Agent B 盲点专项）', () => {
  it('applyRequestDecision 的 fromStatus 是迁移前的真实状态，不随 status 变化', () => {
    // 从 paused 迁移到 pending：fromStatus 必须是 paused，不是 pending
    const item = makeProposalWorkItem({ status: 'paused' });
    const result = applyRequestDecision(item, 'walker', makeDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry: WorkItemHistoryEntry = result.workItem.history[0]!;
    expect(entry.fromStatus).toBe('paused');
    expect(entry.toStatus).toBe('pending');
    expect(entry.fromStatus).not.toBe(entry.toStatus); // 关键：不相等
  });

  it('applyDecide 的 fromStatus 是迁移前的真实状态', () => {
    // 从 proposal 直接 accept：fromStatus 必须是 proposal
    const item = makeProposalWorkItem({ status: 'proposal' });
    const result = applyDecide(
      item,
      { outcome: 'accepted', reason: 'x', actor: 'walker' },
      makeDeps(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = result.workItem.history[0]!;
    expect(entry.fromStatus).toBe('proposal');
    expect(entry.toStatus).toBe('accepted');
    expect(entry.fromStatus).not.toBe(entry.toStatus);
  });

  it('applyCreateAction 的 status-change fromStatus 是迁移前的 accepted，不是迁移后的 acting', () => {
    const item = makeProposalWorkItem({ status: 'accepted' });
    const result = applyCreateAction(
      item,
      {
        actionType: 'create-content',
        targetType: 'content',
        expectedOutcome: 'x',
        actor: 'walker',
      },
      makeDeps(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const statusChange = result.workItem.history[0]!;
    expect(statusChange.kind).toBe('status-change');
    expect(statusChange.fromStatus).toBe('accepted');
    expect(statusChange.toStatus).toBe('acting');
    expect(statusChange.fromStatus).not.toBe(statusChange.toStatus);
  });
});
