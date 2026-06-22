/**
 * domain/workitem/apply —— WorkItem 状态迁移的纯 apply 函数（Task 3 + Task 4）
 *
 * 把 service 层 `createProposal / requestDecision / decide / createAction`（Task 3）+
 * `updateAction / recordOutcome / overridePriority`（Task 4）七个迁移的
 * 「信任边界 + 状态迁移 + history 构造」抽到纯函数，内部统一调 `canTransition`（修 BUG #4）。
 *
 * 红线（GC5）：本文件零 IO 依赖。
 * - 时间通过 `deps.clock.now()` 注入，ID 通过 `deps.idGen.*()` 注入。
 * - 不 import `@/conversation/store`，不调 `Date.now` / `crypto.randomUUID`。
 * - 不可变风格：返回新 WorkItem 对象，不 mutate 入参。
 *
 * 红线（GC1）：service 的 `WorkbenchServicePort` 接口不变；本文件是新增并行模块，
 * Task 6 才让 service 委托 domain。Task 3/4 不改 service。
 *
 * history 构造约定（Agent B 指出的盲点）：
 * - `fromStatus` 必须是**迁移前的真实状态**（在闭包顶部捕获），不是迁移后再回溯判断。
 *   对照 service `decide` L234 / `recordOutcome` L380 的正确模式，
 *   避免 `updateAction` L334 的 bug（迁移后用 item.status 当 fromStatus，永远等于 toStatus）。
 *
 * Task 4 修复的 bug：
 * - BUG #1（applyUpdateAction）：completed 分支的 status-change 用顶部捕获的 `from`（WorkItem 层）
 *   和 `fromActionStatus`（action 层），不再回溯式三元判断（service L334 bug）。
 * - BUG #4（applyUpdateAction / applyRecordOutcome）：非法源迁移收紧 ——
 *   `canTransition(current.status, 'awaiting-verification' | 'resolved')` 拒绝时返回 invalid-transition。
 *   之前 service 静默接受 paused→awaiting-verification / accepted→resolved 等非法迁移。
 * - BUG #2（applyOverridePriority）：history kind 从 'status-change' 改为 'priority-override'，
 *   正确反映"优先级覆盖"事件性质（不是状态迁移）。
 */

import type {
  CreateActionInput,
  CreateProposalInput,
  DecideInput,
  RecordOutcomeInput,
  UpdateActionInput,
} from '@/services/interfaces';
import type {
  WorkItem,
  WorkItemAction,
  WorkItemHistoryEntry,
  WorkItemOutcome,
  WorkItemStatus,
} from '@/stores/ports';

import { canTransition } from './state-machine';
import { hasSufficientEvidence } from './rules';
import type { WorkItemDeps, WorkItemDomainResult } from './types';

/** P4：AI 来源 proposal 的默认存活天数。过期后退出"今日/立即处理"投影，仍留审计。 */
const AI_PROPOSAL_TTL_DAYS = 14;

/**
 * 在 ISO 时间戳上加若干天，返回新的 ISO 字符串。
 *
 * 纯函数：基于入参 `nowIso` 计算，不调用 `new Date()`（GC5）。
 */
function addDaysIso(nowIso: string, days: number): string {
  const d = new Date(nowIso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** 构造一条 history entry（补齐 historyId / occurredAt）。*/
function buildHistory(
  deps: WorkItemDeps,
  entry: Omit<WorkItemHistoryEntry, 'historyId' | 'occurredAt'>,
): WorkItemHistoryEntry {
  return {
    ...entry,
    historyId: deps.idGen.historyId(),
    occurredAt: deps.clock.now(),
  };
}

/**
 * applyCreateProposal —— 创建一个全新的 WorkItem（无迁移，initialStatus 硬编码）。
 *
 * 信任边界（逐行对齐 service `createProposal` L114-123）：
 * 1. title 空 → `invalid-input`
 * 2. evidenceRefs 空 → `missing-evidence`
 * 3. AI + now + 无证据 → `invalid-input`（P4 安全护栏：AI 无证据假设不能进"立即处理"）
 *
 * 清理（brief 允许）：不复制 service L132-134 的 decision 死代码（三元两分支相同），
 * 直接用合理值 `{ requestedDecision: input.summary, outcome: 'pending' }`。
 *
 * initialStatus：requestDecision && hasSufficientEvidence ? 'pending' : 'proposal'。
 * expiresAt：ai-asset 队列写 clock.now() + 14d，其余 undefined。
 *
 * history：恒写一条 `created`（fromStatus=null）；若直接进 pending 再追加 `status-change`。
 */
export function applyCreateProposal(
  input: CreateProposalInput,
  deps: WorkItemDeps,
): WorkItemDomainResult {
  // 1. 信任边界
  if (!input.title.trim()) {
    return { ok: false, code: 'invalid-input', message: '标题不能为空。' };
  }
  if (!input.evidenceRefs || input.evidenceRefs.length === 0) {
    return { ok: false, code: 'missing-evidence', message: '提案必须至少引用一条证据，不能无凭据创建。' };
  }
  if (
    input.queue === 'ai-asset'
    && input.priorityBand === 'now'
    && !hasSufficientEvidence(input.evidenceRefs)
  ) {
    return {
      ok: false,
      code: 'invalid-input',
      message: 'AI 无证据假设不能进入"立即处理"，请补充已验证证据或降级优先级。',
    };
  }

  // 2. 计算初始状态（无 canTransition —— 新建对象，白名单不适用）
  const timestamp = deps.clock.now();
  const initialStatus: WorkItemStatus =
    input.requestDecision && hasSufficientEvidence(input.evidenceRefs)
      ? 'pending'
      : 'proposal';

  // 3. 构造新 WorkItem（不可变）
  const workItem: WorkItem = {
    workItemId: deps.idGen.workItemId(),
    queue: input.queue,
    title: input.title.trim(),
    summary: input.summary.trim(),
    status: initialStatus,
    priorityBand: input.priorityBand,
    priorityReasons: input.priorityReasons ?? [],
    uncertainty: input.uncertainty ?? [],
    evidenceRefs: input.evidenceRefs,
    // 清理后的合理值（不再复制 service L132-134 的死代码）
    decision: { requestedDecision: input.summary, outcome: 'pending' },
    actions: [],
    outcomes: [],
    history: [],
    topicId: input.topicId,
    expiresAt: input.queue === 'ai-asset' ? addDaysIso(timestamp, AI_PROPOSAL_TTL_DAYS) : undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  // 4. history：恒写 created
  workItem.history.push(
    buildHistory(deps, {
      fromStatus: null,
      toStatus: initialStatus,
      actor: input.actor,
      reason: '创建工作项',
      kind: 'created',
      detail: { queue: input.queue, evidenceCount: input.evidenceRefs.length },
    }),
  );
  // 直接进 pending 时再追加 status-change（fromStatus 用字面量 'proposal'，对照 service L167）
  if (initialStatus === 'pending') {
    workItem.history.push(
      buildHistory(deps, {
        fromStatus: 'proposal',
        toStatus: 'pending',
        actor: input.actor,
        reason: '证据完整，请求决定',
        kind: 'status-change',
      }),
    );
  }

  return { ok: true, workItem };
}

/**
 * applyRequestDecision —— 证据完整时把 proposal 推进到 pending。
 *
 * 信任边界（对齐 service `requestDecision` L185-190）：
 * 1. hasSufficientEvidence 否 → `missing-evidence`
 * 2. canTransition(current.status, 'pending') 否 → `invalid-transition`
 *
 * history：一条 `status-change`，fromStatus = 迁移前的真实状态（闭包顶部捕获）。
 */
export function applyRequestDecision(
  current: WorkItem,
  actor: string,
  deps: WorkItemDeps,
): WorkItemDomainResult {
  // 闭包顶部捕获迁移前状态（Agent B 盲点修复：fromStatus 不回溯判断）
  const fromStatus = current.status;

  // 1. 信任边界
  if (!hasSufficientEvidence(current.evidenceRefs)) {
    return { ok: false, code: 'missing-evidence', message: '证据不足，不能请求决定。' };
  }
  // 2. 状态迁移校验
  if (!canTransition(fromStatus, 'pending')) {
    return {
      ok: false,
      code: 'invalid-transition',
      message: `当前状态 ${fromStatus} 不能进入 pending。`,
    };
  }

  // 3. 不可变更新
  const timestamp = deps.clock.now();
  const workItem: WorkItem = {
    ...current,
    status: 'pending',
    decision: { ...current.decision, outcome: 'pending' },
    history: [
      ...current.history,
      buildHistory(deps, {
        fromStatus,
        toStatus: 'pending',
        actor,
        reason: '请求 Walker 决定',
        kind: 'status-change',
      }),
    ],
    updatedAt: timestamp,
  };

  return { ok: true, workItem };
}

/**
 * applyDecide —— Walker 作出接受/拒绝/暂缓决定。
 *
 * 信任边界（对齐 service `decide` L213-231）：
 * 1. reason 空 → `invalid-input`
 * 2. 状态不在 {proposal, pending, paused} → `invalid-transition`（语义前置守卫）
 * 3. canTransition(current.status, target) 否 → `invalid-transition`
 * 4. target=accepted 且 hasSufficientEvidence 否 → `missing-evidence`
 *
 * history：一条 `decision-updated`，fromStatus = 迁移前真实状态。
 */
export function applyDecide(
  current: WorkItem,
  input: DecideInput,
  deps: WorkItemDeps,
): WorkItemDomainResult {
  // 闭包顶部捕获迁移前状态
  const fromStatus = current.status;

  // 1. reason 非空
  if (!input.reason.trim()) {
    return { ok: false, code: 'invalid-input', message: '接受/拒绝/暂缓都必须填写理由。' };
  }

  // 计算 target（与 service L217-220 一致）
  const targetStatus: WorkItemStatus =
    input.outcome === 'accepted' ? 'accepted'
      : input.outcome === 'rejected' ? 'rejected'
      : 'paused';

  // 2. 前置语义守卫：只有 proposal / pending / paused 能作出决定
  if (fromStatus !== 'proposal' && fromStatus !== 'pending' && fromStatus !== 'paused') {
    return {
      ok: false,
      code: 'invalid-transition',
      message: `当前状态 ${fromStatus} 不能作出决定。`,
    };
  }
  // 3. 白名单校验（修 BUG #4：统一走 canTransition）
  if (!canTransition(fromStatus, targetStatus)) {
    return {
      ok: false,
      code: 'invalid-transition',
      message: `状态 ${fromStatus} 不能迁移到 ${targetStatus}。`,
    };
  }
  // 4. 进入 accepted 需要证据完整
  if (targetStatus === 'accepted' && !hasSufficientEvidence(current.evidenceRefs)) {
    return { ok: false, code: 'missing-evidence', message: '证据不足，不能接受。' };
  }

  // 5. 不可变更新
  const timestamp = deps.clock.now();
  const workItem: WorkItem = {
    ...current,
    status: targetStatus,
    decision: {
      ...current.decision,
      outcome: input.outcome,
      reason: input.reason,
      decidedBy: input.actor,
      decidedAt: timestamp,
    },
    history: [
      ...current.history,
      buildHistory(deps, {
        fromStatus,
        toStatus: targetStatus,
        actor: input.actor,
        reason: input.reason,
        kind: 'decision-updated',
        detail: { decision: input.outcome },
      }),
    ],
    updatedAt: timestamp,
  };

  return { ok: true, workItem };
}

/**
 * applyCreateAction —— 为 accepted 决定派生可执行 Action，并把 WorkItem 推进到 acting。
 *
 * 信任边界（对齐 service `createAction` L261-266）：
 * 1. 状态不在 {accepted, acting} → `invalid-transition`
 *    （accepted→acting 走白名单；acting→acting 的"无变化"由 action-added 记录，不触发状态迁移）
 * 2. expectedOutcome 空 → `missing-expected-outcome`
 *
 * BUG #4 修复：accepted→acting 的迁移通过 `canTransition('accepted', 'acting')` 校验（白名单内合法）。
 *
 * history：
 * - 若 accepted→acting 迁移：先追加一条 `status-change`（fromStatus=accepted 捕获值）
 * - 恒追加一条 `action-added`，其 fromStatus/toStatus 用迁移完成后的状态（对照 service L297-304）
 */
export function applyCreateAction(
  current: WorkItem,
  input: CreateActionInput,
  deps: WorkItemDeps,
): WorkItemDomainResult {
  // 闭包顶部捕获迁移前状态
  const fromStatus = current.status;

  // 1. 状态守卫：只有 accepted / acting 能创建行动
  if (fromStatus !== 'accepted' && fromStatus !== 'acting') {
    return {
      ok: false,
      code: 'invalid-transition',
      message: '只有已接受的决定才能创建行动。',
    };
  }
  // 2. expectedOutcome 必填（授权前提）
  if (!input.expectedOutcome.trim()) {
    return {
      ok: false,
      code: 'missing-expected-outcome',
      message: '行动必须声明预期结果，否则不能授权。',
    };
  }

  // BUG #4 修复：accepted→acting 通过 canTransition 校验（白名单合法）。
  // acting→acting 不触发状态迁移（仅 action-added），不需要 canTransition。
  const willTransition = fromStatus === 'accepted';
  if (willTransition && !canTransition(fromStatus, 'acting')) {
    return {
      ok: false,
      code: 'invalid-transition',
      message: `状态 ${fromStatus} 不能迁移到 acting。`,
    };
  }

  // 3. 构造新 Action
  const timestamp = deps.clock.now();
  const action: WorkItemAction = {
    actionId: deps.idGen.actionId(),
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

  // 4. 不可变更新：追加 action + 可选状态迁移 + history
  const newStatus: WorkItemStatus = willTransition ? 'acting' : fromStatus;
  const newHistory: WorkItemHistoryEntry[] = [...current.history];

  if (willTransition) {
    newHistory.push(
      buildHistory(deps, {
        fromStatus,
        toStatus: 'acting',
        actor: input.actor,
        reason: `创建行动 ${action.actionType}`,
        kind: 'status-change',
      }),
    );
  }
  // action-added 恒写：fromStatus/toStatus 用迁移完成后的状态（对照 service L297-304）
  newHistory.push(
    buildHistory(deps, {
      fromStatus: newStatus,
      toStatus: newStatus,
      actor: input.actor,
      reason: `新增行动 ${action.actionType}`,
      kind: 'action-added',
      detail: { actionId: action.actionId, actionType: action.actionType },
    }),
  );

  const workItem: WorkItem = {
    ...current,
    status: newStatus,
    actions: [...current.actions, action],
    history: newHistory,
    updatedAt: timestamp,
  };

  return { ok: true, workItem };
}

// ---------------------------------------------------------------------------
// Task 4：剩余 3 个迁移的 apply（修 BUG #1 / #2 / #4）
// ---------------------------------------------------------------------------

/**
 * applyUpdateAction —— 更新某条 Action 的状态；completed 时推动 WorkItem 进入 awaiting-verification。
 *
 * 信任边界（对齐 service `updateAction` L320-348）：
 * 1. actionId 找不到 → `not-found`
 * 2. completed → awaiting-verification 走 `canTransition(from, 'awaiting-verification')`（BUG #4 收紧）
 *
 * BUG #1 修复：history 的 status-change `fromStatus` 用**顶部捕获**的 `from`（WorkItem 层）
 *   和 `fromActionStatus`（action 层），不是 service L334 的回溯式三元
 *   `item.status === 'awaiting-verification' ? 'acting' : item.status`（恒等 bug）。
 *
 * BUG #4 修复（用户已确认收紧）：
 * - 合法源（acting / awaiting-verification）→ awaiting-verification：通过。
 * - 非法源（如 paused / accepted / proposal / pending / resolved / rejected）
 *   → `invalid-transition`（之前被 service 静默接受，现拒绝）。
 *
 * history（对照 applyCreateAction 模式，reviewer 已确认）：
 * - completed 且迁移合法：先追加一条 `status-change`（fromStatus=from 真实捕获值）
 * - 恒追加一条 `action-updated`，其顶层 fromStatus/toStatus 用 WorkItem 迁移完成后的状态（可能自反），
 *   真实 action 层迁移记在 `detail.from`/`detail.to`（action 改写前/后）。
 */
export function applyUpdateAction(
  current: WorkItem,
  actionId: string,
  input: UpdateActionInput,
  deps: WorkItemDeps,
): WorkItemDomainResult {
  // 闭包顶部捕获迁移前状态（WorkItem 层 + action 层）
  // BUG #1：必须在改写前捕获，不能像 service L334 那样改写后回溯判断
  const from = current.status;
  const targetActionExisting = current.actions.find(a => a.actionId === actionId);
  if (!targetActionExisting) {
    return { ok: false, code: 'not-found', message: '行动不存在。' };
  }
  const fromActionStatus = targetActionExisting.status;

  // completed 触发 WorkItem 推进到 awaiting-verification
  const willComplete = input.status === 'completed';
  let newStatus: WorkItemStatus = from;
  if (willComplete) {
    if (from === 'awaiting-verification') {
      // 已在待验证（如第二个 action 完成）：状态不变，无迁移（类似 acting→acting），
      // 不走 canTransition（白名单不含自迁移）。仅写 action-updated。
      newStatus = 'awaiting-verification';
    } else {
      // BUG #4 修复（收紧）：acting → awaiting-verification 走 canTransition 守卫，
      // 非法源（paused / accepted / proposal / pending / resolved / rejected）被拒绝。
      if (!canTransition(from, 'awaiting-verification')) {
        return {
          ok: false,
          code: 'invalid-transition',
          message: `当前状态 ${from} 不能迁移到 awaiting-verification。`,
        };
      }
      newStatus = 'awaiting-verification';
    }
  }

  // 构造更新后的 actions 数组（不可变）
  const timestamp = deps.clock.now();
  const updatedActions = current.actions.map(a => {
    if (a.actionId !== actionId) return a;
    const updated: WorkItemAction = {
      ...a,
      status: input.status,
      updatedAt: timestamp,
    };
    if (input.targetId !== undefined) updated.targetId = input.targetId;
    return updated;
  });

  // history：先可能的 status-change，再恒写的 action-updated
  const newHistory: WorkItemHistoryEntry[] = [...current.history];
  // 仅当真实状态迁移（from !== awaiting-verification）时写 status-change；
  // 已在 awaiting-verification 时第二个 action 完成不写 status-change（无迁移）。
  if (willComplete && from !== 'awaiting-verification') {
    newHistory.push(
      buildHistory(deps, {
        fromStatus: from, // BUG #1 修复：顶部捕获的真实源（不是回溯式三元）
        toStatus: 'awaiting-verification',
        actor: input.actor,
        reason: input.reason ?? '行动完成，等待现实验证',
        kind: 'status-change',
      }),
    );
  }
  // action-updated：顶层 fromStatus/toStatus 用 WorkItem 迁移后状态（可能自反），
  // action 层真实迁移记在 detail.from / detail.to
  newHistory.push(
    buildHistory(deps, {
      fromStatus: newStatus,
      toStatus: newStatus,
      actor: input.actor,
      reason: input.reason ?? `行动状态变更 ${fromActionStatus} → ${input.status}`,
      kind: 'action-updated',
      detail: { actionId, from: fromActionStatus, to: input.status },
    }),
  );

  const workItem: WorkItem = {
    ...current,
    status: newStatus,
    actions: updatedActions,
    history: newHistory,
    updatedAt: timestamp,
  };

  return { ok: true, workItem };
}

/**
 * applyRecordOutcome —— 为已执行的 Action 记录现实结果，把 WorkItem 推进到 resolved。
 *
 * 信任边界（对齐 service `recordOutcome` L359-367）：
 * 1. summary 空 → `invalid-input`
 * 2. 关联 action 找不到 → `not-found`
 * 3. action.status ∉ {completed, awaiting-verification} → `invalid-transition`（action 层信任边界）
 *
 * BUG #4 修复（用户已确认收紧）：
 * - → resolved 走 `canTransition(current.status, 'resolved')`。
 * - 合法源（acting / awaiting-verification）→ resolved：通过。
 * - 非法源（paused / accepted / proposal / pending / resolved / rejected）
 *   → `invalid-transition`（之前被 service 静默接受，现拒绝）。
 *
 * history：一条 `outcome-recorded`，fromStatus = 顶部捕获的真实源。
 */
export function applyRecordOutcome(
  current: WorkItem,
  input: RecordOutcomeInput,
  deps: WorkItemDeps,
): WorkItemDomainResult {
  // 闭包顶部捕获迁移前状态
  const from = current.status;

  // 1. summary 非空
  if (!input.summary.trim()) {
    return { ok: false, code: 'invalid-input', message: '结果必须包含摘要。' };
  }

  // 2. 关联 action 必须存在
  const action = current.actions.find(a => a.actionId === input.actionId);
  if (!action) {
    return { ok: false, code: 'not-found', message: '关联的行动不存在。' };
  }

  // 3. action 层信任边界：只有 completed / awaiting-verification 的 action 能记录结果
  if (action.status !== 'completed' && action.status !== 'awaiting-verification') {
    return {
      ok: false,
      code: 'invalid-transition',
      message: '只能为已执行完的行动记录结果。',
    };
  }

  // 4. BUG #4 修复（收紧）：WorkItem 层状态迁移守卫
  if (!canTransition(from, 'resolved')) {
    return {
      ok: false,
      code: 'invalid-transition',
      message: `当前状态 ${from} 不能迁移到 resolved。`,
    };
  }

  // 5. 构造新 Outcome
  const timestamp = deps.clock.now();
  const outcome: WorkItemOutcome = {
    outcomeId: deps.idGen.outcomeId(),
    actionId: input.actionId,
    result: input.result,
    summary: input.summary.trim(),
    evidenceRefs: input.evidenceRefs,
    observedAt: timestamp,
    nextDecisionSuggested: input.nextDecisionSuggested,
  };

  // 6. 不可变更新
  const workItem: WorkItem = {
    ...current,
    status: 'resolved',
    outcomes: [...current.outcomes, outcome],
    history: [
      ...current.history,
      buildHistory(deps, {
        fromStatus: from,
        toStatus: 'resolved',
        actor: input.actor,
        reason: `记录结果 ${input.result}`,
        kind: 'outcome-recorded',
        detail: { outcomeId: outcome.outcomeId, result: input.result },
      }),
    ],
    updatedAt: timestamp,
  };

  return { ok: true, workItem };
}

/**
 * applyOverridePriority —— Walker 人工覆盖优先级带，保存理由与 from→to 历史（不抹掉原排序依据）。
 *
 * 信任边界（对齐 service `overridePriority` L406-419）：
 * 1. reason 空 → `invalid-input`
 * 2. fromBand === toBand → `invalid-input`（同带无需覆盖）
 * 3. AI + now + 无证据 → `invalid-input`（P4 安全护栏，与创建时一致）
 *
 * BUG #2 修复：history `kind` 从 `'status-change'` 改为 `'priority-override'`。
 * - fromStatus/toStatus 自反（这不是状态迁移），但 kind 正确反映事件性质。
 * - priorityReasons append 覆盖理由（不抹掉原排序依据）。
 *
 * history：一条 `priority-override`，detail 携带 { override, fromBand, toBand }。
 */
export function applyOverridePriority(
  current: WorkItem,
  input: { priorityBand: WorkItem['priorityBand']; reason: string; actor: string },
  deps: WorkItemDeps,
): WorkItemDomainResult {
  // 1. reason 非空
  if (!input.reason.trim()) {
    return { ok: false, code: 'invalid-input', message: '覆盖优先级必须填写理由。' };
  }

  const fromBand = current.priorityBand;
  // 2. 同带无需覆盖
  if (fromBand === input.priorityBand) {
    return { ok: false, code: 'invalid-input', message: '新优先级与当前相同，无需覆盖。' };
  }
  // 3. P4：AI 无证据假设不能覆盖到 now（与创建时护栏一致）
  if (
    input.priorityBand === 'now'
    && current.queue === 'ai-asset'
    && !hasSufficientEvidence(current.evidenceRefs)
  ) {
    return {
      ok: false,
      code: 'invalid-input',
      message: 'AI 无证据假设不能覆盖为"立即处理"。',
    };
  }

  // 不可变更新
  const timestamp = deps.clock.now();
  const workItem: WorkItem = {
    ...current,
    priorityBand: input.priorityBand,
    // 覆盖理由 append（不抹掉原排序依据）
    priorityReasons: [...current.priorityReasons, `人工覆盖：${input.reason}`],
    history: [
      ...current.history,
      buildHistory(deps, {
        // BUG #2 修复：kind 从 'status-change' 改为 'priority-override'
        fromStatus: current.status,
        toStatus: current.status,
        actor: input.actor,
        reason: `人工覆盖优先级 ${fromBand} → ${input.priorityBand}：${input.reason}`,
        kind: 'priority-override',
        detail: { override: true, fromBand, toBand: input.priorityBand },
      }),
    ],
    updatedAt: timestamp,
  };

  return { ok: true, workItem };
}
