/**
 * Workbench Service —— WorkItem 决策聚合的业务编排（P0-B/C / hai-razor 包 B）
 *
 * 职责：
 * - 所有状态迁移在此完成，页面/前端脚本不拼装业务事实。
 * - 守护 hai-razor 信任边界：
 *   1. 无 evidenceRefs 的项不能进入 pending/decided/acting。
 *   2. 没有 expectedOutcome 的 Action 不能进入 authorized。
 *   3. 没有 completed Action 不能记录 Outcome（"已验证"）。
 *   4. 每次正式状态变化写一条 append-only history（actor/时间/from→to/reason）。
 * - 生产缺 Redis 时写操作返回 storage-unavailable（由 service 层判定，不静默退回内存）。
 */

import { randomUUID } from 'node:crypto';

import { getRedis } from '@/conversation/store';
import type { StorageMode } from '@/lib/storage-mode';
import type {
  EvidenceRef,
  WorkItem,
  WorkItemAction,
  WorkItemHistoryEntry,
  WorkItemOutcome,
  WorkItemRepositoryPort,
  WorkItemStatus,
} from '@/stores/ports';
import { createWorkItemStore } from '@/stores/work-item.store';
import { resolveStorageMode } from '@/lib/storage-mode';

import type {
  CreateActionInput,
  CreateProposalInput,
  DecideInput,
  RecordOutcomeInput,
  UpdateActionInput,
  WorkbenchResult,
  WorkbenchServicePort,
} from './interfaces';
import type { WorkItemActionType, WorkItemOutcomeResult } from '@/stores/ports';

const WORKITEM_ID_PREFIX = 'wi';

/** P4：AI 来源 proposal 的默认存活天数。过期后不进入"今日/立即处理"投影，但仍留审计。 */
const AI_PROPOSAL_TTL_DAYS = 14;

function nowIso(): string {
  return new Date().toISOString();
}

function expiryFromDays(days: number): string {
  // 用基础日期计算，避免引入额外依赖；nowIso 已是 ISO 字符串
  const d = new Date(nowIso());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** P4：proposal 是否已过期（仅 proposal 状态有过期概念；过期不删除，只退出活跃投影） */
function isProposalExpired(item: WorkItem, now = nowIso()): boolean {
  return item.status === 'proposal' && typeof item.expiresAt === 'string' && item.expiresAt < now;
}

function makeId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function resolveWorkbenchStorageMode(): StorageMode {
  return resolveStorageMode({ hasRedis: Boolean(getRedis()) });
}

/** 仅 development 环境允许内存降级写入 */
function isMemoryDevelopment(): boolean {
  return resolveStorageMode({ hasRedis: Boolean(getRedis()) }) === 'memory-development';
}

/** 是否进入 pending 的证据完整性判断：至少一条非 unverified 证据 */
function hasSufficientEvidence(evidenceRefs: EvidenceRef[]): boolean {
  return evidenceRefs.some(ref => ref.qualityStatus !== 'unverified' && ref.summary.trim().length > 0);
}

function fail<T = void>(code: WorkbenchResult['code'], message: string): WorkbenchResult<T> {
  return { ok: false, code, message };
}

function ok<T>(data: T): WorkbenchResult<T> {
  return { ok: true, code: 'ok', data };
}

/** 状态迁移白名单 —— 禁止跳跃式迁移，便于审计与回放 */
const ALLOWED_TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  proposal: ['pending', 'accepted', 'rejected', 'paused'],
  pending: ['accepted', 'rejected', 'paused', 'proposal'],
  accepted: ['acting', 'paused', 'rejected'],
  rejected: [],
  paused: ['pending', 'proposal', 'rejected'],
  acting: ['awaiting-verification', 'resolved', 'paused'],
  'awaiting-verification': ['resolved', 'acting', 'paused'],
  resolved: [],
};

function canTransition(from: WorkItemStatus, to: WorkItemStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

function appendHistory(
  workItem: WorkItem,
  entry: Omit<WorkItemHistoryEntry, 'historyId' | 'occurredAt'>,
): void {
  workItem.history.push({
    ...entry,
    historyId: makeId('wh'),
    occurredAt: nowIso(),
  });
}

export class WorkbenchService implements WorkbenchServicePort {
  constructor(options?: { repository?: WorkItemRepositoryPort; storageMode?: StorageMode | (() => StorageMode) }) {
    this.repository = options?.repository ?? createWorkItemStore();
    const mode = options?.storageMode;
    this.resolveMode = typeof mode === 'function' ? mode : () => mode ?? resolveWorkbenchStorageMode();
  }

  private readonly repository;
  private readonly resolveMode;

  private ensureWritable<T>(): WorkbenchResult<T> | null {
    if (this.resolveMode() === 'unavailable') {
      return fail('storage-unavailable', '生产环境缺少持久化存储，无法写入工作项。');
    }
    return null;
  }

  async createProposal(input: CreateProposalInput): Promise<WorkbenchResult<WorkItem>> {
    if (!input.title.trim()) return fail('invalid-input', '标题不能为空。');
    if (!input.evidenceRefs || input.evidenceRefs.length === 0) {
      return fail('missing-evidence', '提案必须至少引用一条证据，不能无凭据创建。');
    }
    // P4 安全护栏：AI 来源（queue=ai-asset）的无证据假设不得进入"立即处理"（now）队列，
    // 避免 AI 草案冒充紧急事项抢占 Walker 的判断带宽。
    // （Walker 自己的 user-demand/walker-thesis/system-event 提案可自由设 now —— 那是人的判断。）
    if (input.queue === 'ai-asset' && input.priorityBand === 'now' && !hasSufficientEvidence(input.evidenceRefs)) {
      return fail('invalid-input', 'AI 无证据假设不能进入"立即处理"，请补充已验证证据或降级优先级。');
    }
    const blocked = this.ensureWritable<WorkItem>();
    if (blocked) return blocked;

    const timestamp = nowIso();
    const initialStatus: WorkItemStatus = input.requestDecision && hasSufficientEvidence(input.evidenceRefs)
      ? 'pending'
      : 'proposal';

    const decision = input.requestDecision && initialStatus === 'pending'
      ? { requestedDecision: input.summary, outcome: 'pending' as const }
      : { requestedDecision: input.summary, outcome: 'pending' as const };

    const workItem: WorkItem = {
      workItemId: makeId(WORKITEM_ID_PREFIX),
      queue: input.queue,
      title: input.title.trim(),
      summary: input.summary.trim(),
      status: initialStatus,
      priorityBand: input.priorityBand,
      priorityReasons: input.priorityReasons ?? [],
      uncertainty: input.uncertainty ?? [],
      evidenceRefs: input.evidenceRefs,
      decision,
      actions: [],
      outcomes: [],
      history: [],
      topicId: input.topicId,
      // P4：AI 来源 proposal 写入过期时间，过期后退出活跃投影（无证据假设不长期占用判断带宽）
      expiresAt: input.queue === 'ai-asset' ? expiryFromDays(AI_PROPOSAL_TTL_DAYS) : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    appendHistory(workItem, {
      fromStatus: null,
      toStatus: initialStatus,
      actor: input.actor,
      reason: '创建工作项',
      kind: 'created',
      detail: { queue: input.queue, evidenceCount: input.evidenceRefs.length },
    });
    if (initialStatus === 'pending') {
      appendHistory(workItem, {
        fromStatus: 'proposal',
        toStatus: 'pending',
        actor: input.actor,
        reason: '证据完整，请求决定',
        kind: 'status-change',
      });
    }

    await this.repository.save(workItem);
    return ok(workItem);
  }

  async requestDecision(workItemId: string, actor: string): Promise<WorkbenchResult<WorkItem>> {
    const blocked = this.ensureWritable<WorkItem>();
    if (blocked) return blocked;
    const existing = await this.repository.findById(workItemId);
    if (!existing) return fail('not-found', '工作项不存在。');

    if (!hasSufficientEvidence(existing.evidenceRefs)) {
      return fail('missing-evidence', '证据不足，不能请求决定。');
    }
    if (!canTransition(existing.status, 'pending')) {
      return fail('invalid-transition', `当前状态 ${existing.status} 不能进入 pending。`);
    }

    const updated = this.mutate(existing, item => {
      const from = item.status;
      item.status = 'pending';
      item.decision = { ...item.decision, outcome: 'pending' };
      appendHistory(item, {
        fromStatus: from,
        toStatus: 'pending',
        actor,
        reason: '请求 Walker 决定',
        kind: 'status-change',
      });
    });
    await this.repository.save(updated);
    return ok(updated);
  }

  async decide(workItemId: string, input: DecideInput): Promise<WorkbenchResult<WorkItem>> {
    const blocked = this.ensureWritable<WorkItem>();
    if (blocked) return blocked;
    const existing = await this.repository.findById(workItemId);
    if (!existing) return fail('not-found', '工作项不存在。');
    if (!input.reason.trim()) {
      return fail('invalid-input', '接受/拒绝/暂缓都必须填写理由。');
    }

    const targetStatus: WorkItemStatus =
      input.outcome === 'accepted' ? 'accepted'
        : input.outcome === 'rejected' ? 'rejected'
        : 'paused';

    if (existing.status !== 'proposal' && existing.status !== 'pending' && existing.status !== 'paused') {
      return fail('invalid-transition', `当前状态 ${existing.status} 不能作出决定。`);
    }
    if (!canTransition(existing.status, targetStatus)) {
      return fail('invalid-transition', `状态 ${existing.status} 不能迁移到 ${targetStatus}。`);
    }
    // 进入 accepted 需要证据完整
    if (targetStatus === 'accepted' && !hasSufficientEvidence(existing.evidenceRefs)) {
      return fail('missing-evidence', '证据不足，不能接受。');
    }

    const updated = this.mutate(existing, item => {
      const from = item.status;
      item.status = targetStatus;
      item.decision = {
        ...item.decision,
        outcome: input.outcome,
        reason: input.reason,
        decidedBy: input.actor,
        decidedAt: nowIso(),
      };
      appendHistory(item, {
        fromStatus: from,
        toStatus: targetStatus,
        actor: input.actor,
        reason: input.reason,
        kind: 'decision-updated',
        detail: { decision: input.outcome },
      });
    });
    await this.repository.save(updated);
    return ok(updated);
  }

  async createAction(workItemId: string, input: CreateActionInput): Promise<WorkbenchResult<WorkItem>> {
    const blocked = this.ensureWritable<WorkItem>();
    if (blocked) return blocked;
    const existing = await this.repository.findById(workItemId);
    if (!existing) return fail('not-found', '工作项不存在。');
    if (existing.status !== 'accepted' && existing.status !== 'acting') {
      return fail('invalid-transition', '只有已接受的决定才能创建行动。');
    }
    if (!input.expectedOutcome.trim()) {
      return fail('missing-expected-outcome', '行动必须声明预期结果，否则不能授权。');
    }

    const timestamp = nowIso();
    const action: WorkItemAction = {
      actionId: makeId('wa'),
      actionType: input.actionType,
      targetType: input.targetType,
      targetId: input.targetId,
      assignee: input.assignee ?? 'walker',
      status: 'authorized',
      expectedOutcome: input.expectedOutcome.trim(),
      verifyAt: input.verifyAt,
      reversible: input.reversible ?? true,
      rollbackPlan: input.rollbackPlan,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const updated = this.mutate(existing, item => {
      const from = item.status;
      item.actions.push(action);
      if (item.status === 'accepted') {
        item.status = 'acting';
        appendHistory(item, {
          fromStatus: from,
          toStatus: 'acting',
          actor: input.actor,
          reason: `创建行动 ${action.actionType}`,
          kind: 'status-change',
        });
      }
      appendHistory(item, {
        fromStatus: item.status,
        toStatus: item.status,
        actor: input.actor,
        reason: `新增行动 ${action.actionType}`,
        kind: 'action-added',
        detail: { actionId: action.actionId, actionType: action.actionType },
      });
    });
    await this.repository.save(updated);
    return ok(updated);
  }

  async updateAction(
    workItemId: string,
    actionId: string,
    input: UpdateActionInput,
  ): Promise<WorkbenchResult<WorkItem>> {
    const blocked = this.ensureWritable<WorkItem>();
    if (blocked) return blocked;
    const existing = await this.repository.findById(workItemId);
    if (!existing) return fail('not-found', '工作项不存在。');

    const action = existing.actions.find(a => a.actionId === actionId);
    if (!action) return fail('not-found', '行动不存在。');

    const updated = this.mutate(existing, item => {
      const target = item.actions.find(a => a.actionId === actionId)!;
      const fromStatus = target.status;
      target.status = input.status;
      target.updatedAt = nowIso();
      if (input.targetId !== undefined) target.targetId = input.targetId;

      // 行动完成推动 WorkItem 进入待验证
      if (input.status === 'completed') {
        item.status = 'awaiting-verification';
        appendHistory(item, {
          fromStatus: item.status === 'awaiting-verification' ? 'acting' : item.status,
          toStatus: 'awaiting-verification',
          actor: input.actor,
          reason: input.reason ?? '行动完成，等待现实验证',
          kind: 'status-change',
        });
      }
      appendHistory(item, {
        fromStatus: item.status,
        toStatus: item.status,
        actor: input.actor,
        reason: input.reason ?? `行动状态变更 ${fromStatus} → ${input.status}`,
        kind: 'action-updated',
        detail: { actionId, from: fromStatus, to: input.status },
      });
    });
    await this.repository.save(updated);
    return ok(updated);
  }

  async recordOutcome(workItemId: string, input: RecordOutcomeInput): Promise<WorkbenchResult<WorkItem>> {
    const blocked = this.ensureWritable<WorkItem>();
    if (blocked) return blocked;
    const existing = await this.repository.findById(workItemId);
    if (!existing) return fail('not-found', '工作项不存在。');
    if (!input.summary.trim()) {
      return fail('invalid-input', '结果必须包含摘要。');
    }

    const action = existing.actions.find(a => a.actionId === input.actionId);
    if (!action) return fail('not-found', '关联的行动不存在。');
    if (action.status !== 'completed' && action.status !== 'awaiting-verification') {
      return fail('invalid-transition', '只能为已执行完的行动记录结果。');
    }

    const outcome: WorkItemOutcome = {
      outcomeId: makeId('wo'),
      actionId: input.actionId,
      result: input.result,
      summary: input.summary.trim(),
      evidenceRefs: input.evidenceRefs,
      observedAt: nowIso(),
      nextDecisionSuggested: input.nextDecisionSuggested,
    };

    const updated = this.mutate(existing, item => {
      const from = item.status;
      item.outcomes.push(outcome);
      item.status = 'resolved';
      appendHistory(item, {
        fromStatus: from,
        toStatus: 'resolved',
        actor: input.actor,
        reason: `记录结果 ${input.result}`,
        kind: 'outcome-recorded',
        detail: { outcomeId: outcome.outcomeId, result: input.result },
      });
    });
    await this.repository.save(updated);
    return ok(updated);
  }

  async findById(workItemId: string): Promise<WorkItem | null> {
    return this.repository.findById(workItemId);
  }

  async overridePriority(
    workItemId: string,
    input: { priorityBand: WorkItem['priorityBand']; reason: string; actor: string },
  ): Promise<WorkbenchResult<WorkItem>> {
    const blocked = this.ensureWritable<WorkItem>();
    if (blocked) return blocked;
    if (!input.reason.trim()) {
      return fail('invalid-input', '覆盖优先级必须填写理由。');
    }
    const existing = await this.repository.findById(workItemId);
    if (!existing) return fail('not-found', '工作项不存在。');

    const fromBand = existing.priorityBand;
    if (fromBand === input.priorityBand) {
      return fail('invalid-input', '新优先级与当前相同，无需覆盖。');
    }
    // P4：人工覆盖也不能把 AI 来源无证据假设提升到"立即处理"（与创建时护栏一致）
    if (input.priorityBand === 'now' && existing.queue === 'ai-asset' && !hasSufficientEvidence(existing.evidenceRefs)) {
      return fail('invalid-input', 'AI 无证据假设不能覆盖为"立即处理"。');
    }

    const updated = this.mutate(existing, item => {
      item.priorityBand = input.priorityBand;
      // 把覆盖理由追加到 priorityReasons（不抹掉原排序依据）
      item.priorityReasons = [...item.priorityReasons, `人工覆盖：${input.reason}`];
      appendHistory(item, {
        fromStatus: item.status,
        toStatus: item.status,
        actor: input.actor,
        reason: `人工覆盖优先级 ${fromBand} → ${input.priorityBand}：${input.reason}`,
        kind: 'status-change',
        detail: { override: true, fromBand, toBand: input.priorityBand },
      });
    });
    await this.repository.save(updated);
    return ok(updated);
  }

  async getTodayProjection(options?: { limit?: number }): Promise<WorkItem[]> {
    const items = await this.repository.listActive({ limit: options?.limit ?? 30 });
    // P4：过期的 AI/无证据 proposal 不进入"今日"投影（保留在存储供审计，不删除）
    return items.filter(item => !isProposalExpired(item));
  }

  async list(options?: Parameters<WorkbenchServicePort['list']>[0]): Promise<WorkItem[]> {
    return this.repository.list(options);
  }

  /**
   * 不可变更新辅助：基于深拷贝执行变更，保留 createdAt，刷新 updatedAt。
   * 结构化克隆会丢失 Date，但 WorkItem 全是可 JSON 序列化的字段。
   */
  private mutate(existing: WorkItem, apply: (item: WorkItem) => void): WorkItem {
    const clone: WorkItem = JSON.parse(JSON.stringify(existing)) as WorkItem;
    apply(clone);
    clone.updatedAt = nowIso();
    return clone;
  }
}

/** 工厂函数 —— 与现有 service 注册风格一致 */
export function createWorkbenchService(): WorkbenchServicePort {
  return new WorkbenchService();
}

/** 仅供测试：当前存储是否为内存开发模式 */
export function __workbenchIsMemoryDevelopment(): boolean {
  return isMemoryDevelopment();
}

// ---------------------------------------------------------------------------
// P1-E02：Outcome → 下一步候选动作建议
//
// 候选动作不自动执行；只生成"建议"，由 Walker 决定是否创建新 Decision/Action。
// 映射来自综合实施方案 P1-E02 表格：
//   useful 且边界稳定     → 保持，观察是否形成 Experience/Rule 候选
//   needs-more           → 补案例、边界、步骤或常见问题（update-content）
//   outdated             → 复核时效性，更新或下线（update-content）
//   mixed(partial)       → 按用户场景拆分内容或补适用边界（create-content）
//   insufficient(inconclusive) → 延长观察或创建 LearningRequest
// ---------------------------------------------------------------------------

export interface NextActionSuggestion {
  /** 建议的动作类型（用于创建新 Action） */
  suggestedActionType: WorkItemActionType;
  /** 给 Walker 看的建议说明 */
  reason: string;
  /** 建议的预期结果文案（用于预填 Action.expectedOutcome） */
  suggestedExpectedOutcome: string;
}

/**
 * 根据已记录的 Outcome 结果派生下一步候选动作。
 * 纯函数，不读取存储、不产生副作用；只产出建议。
 */
export function suggestNextAction(input: {
  result: WorkItemOutcomeResult;
  outcomeSummary: string;
}): NextActionSuggestion | null {
  switch (input.result) {
    case 'successful':
      // 保持，观察是否形成 Experience/Rule 候选
      return {
        suggestedActionType: 'evaluate-asset',
        reason: '内容有效且边界稳定。观察是否形成可复用的 Experience / Rule 候选，沉淀为资产。',
        suggestedExpectedOutcome: '评估该内容是否值得沉淀为 Experience 或 Rule 候选',
      };
    case 'partial':
      // mixed：按用户场景拆分内容或补适用边界
      return {
        suggestedActionType: 'create-content',
        reason: '结果部分有效。不同用户场景可能需要拆分内容，或补充适用边界说明。',
        suggestedExpectedOutcome: '按用户场景拆分内容或补充适用边界',
      };
    case 'failed':
      // 明确失败：复核方向
      return {
        suggestedActionType: 'update-content',
        reason: '内容未能解决问题。需要复核方向、重写或重新定位，再决定更新还是下线。',
        suggestedExpectedOutcome: '复核内容方向，决定更新或下线',
      };
    case 'inconclusive':
      // 证据不足：延长观察或创建 LearningRequest
      return {
        suggestedActionType: 'create-learning-request',
        reason: '结果不足以判断。延长观察，或创建 LearningRequest 补充实践 / 反例 / 访谈。',
        suggestedExpectedOutcome: '补充实践、反例或访谈证据后再判断',
      };
    default:
      return null;
  }
}
