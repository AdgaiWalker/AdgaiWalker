/**
 * 站主「下一动作」规则（纯函数，无 IO、无路由）
 * 职责：从线索/题苗/执行列表挑优先任务；href 由调用方按 ADMIN_ROUTES 映射。
 *
 * 优先级：入池 > 主选 > 检验 > 交付；同类至多 1 条；最多 MAX_NEXT_ACTIONS。
 *
 * 依赖：无
 * 调用：Admin 计划面 NextActionsPanel
 * 触发：站主打开计划
 * 实现：列表扫描 + 优先级切片
 */

export type NextActionKind =
  | 'pool-clue'
  | 'promote-seed'
  | 'review-execution'
  | 'deliver-execution';

export interface NextAction {
  kind: NextActionKind;
  id: string;
  label: string;
  summary: string;
}

export interface NextActionClue {
  id: string;
  body: string;
  poolStatus: string;
}

export interface NextActionSeed {
  id: string;
  title: string;
  primaryClueId: string | null;
}

export interface NextActionExecution {
  id: string;
  seedId: string;
  status: string;
  deliveryUrl: string | null;
  outcome: string | null;
}

export interface NextActionInput {
  clues: readonly NextActionClue[];
  seeds: readonly NextActionSeed[];
  executions: readonly NextActionExecution[];
}

/** 站主一次只看前几条 */
export const MAX_NEXT_ACTIONS = 3;

function hasDelivery(ex: NextActionExecution): boolean {
  return (
    ex.status === 'delivered' ||
    (ex.deliveryUrl != null && ex.deliveryUrl.trim().length > 0)
  );
}

export function pickNextActions(input: NextActionInput): NextAction[] {
  const actions: NextAction[] = [];

  const candidate = input.clues.find((c) => c.poolStatus === 'candidate');
  if (candidate) {
    actions.push({
      kind: 'pool-clue',
      id: candidate.id,
      label: '入池线索',
      summary: candidate.body,
    });
  }

  const hasInPool = input.clues.some((c) => c.poolStatus === 'in-pool');
  const seedNeedingPrimary = input.seeds.find((s) => s.primaryClueId == null);
  if (hasInPool && seedNeedingPrimary) {
    actions.push({
      kind: 'promote-seed',
      id: seedNeedingPrimary.id,
      label: '主选题苗',
      summary: seedNeedingPrimary.title,
    });
  }

  const needsReview = input.executions.find(
    (ex) => ex.outcome == null && hasDelivery(ex),
  );
  if (needsReview) {
    actions.push({
      kind: 'review-execution',
      id: needsReview.id,
      label: '检验执行',
      summary: needsReview.deliveryUrl?.trim() || '待检验',
    });
  }

  const needsDeliver = input.executions.find(
    (ex) => ex.outcome == null && !hasDelivery(ex),
  );
  if (needsDeliver) {
    actions.push({
      kind: 'deliver-execution',
      id: needsDeliver.id,
      label: '交付执行',
      summary: '待交付',
    });
  }

  return actions.slice(0, MAX_NEXT_ACTIONS);
}

export const NEXT_ACTION_UNTITLED_SEED = '未命名题苗';

export function looksLikeRecordId(value: string): boolean {
  const trimmed = value.trim();
  return /^t-[a-z0-9]+$/i.test(trimmed) || (/^[a-z0-9_-]{8,}$/i.test(trimmed) && !/\s/.test(trimmed));
}

export function humanizeSeedSummary(title: string, linkedBodies: readonly string[]): string {
  const body = linkedBodies.find((item) => item.trim().length > 0)?.trim();
  if (body) return body;
  if (looksLikeRecordId(title)) return NEXT_ACTION_UNTITLED_SEED;
  return title;
}

export interface NextActionDecorateContext {
  clues: readonly { id: string; body: string }[];
  seeds: readonly {
    id: string;
    title: string;
    links?: readonly { clueId: string }[];
  }[];
  executions: readonly { id: string; seedId: string }[];
}

/** 展示摘要：关联线索正文优先；禁止把记录 id 当人话。不改优先级。 */
export function decorateNextActionSummaries(
  actions: readonly NextAction[],
  ctx: NextActionDecorateContext,
): NextAction[] {
  const bodyByClue = new Map(ctx.clues.map((clue) => [clue.id, clue.body]));
  const seedById = new Map(ctx.seeds.map((seed) => [seed.id, seed]));
  const executionById = new Map(ctx.executions.map((item) => [item.id, item]));

  return actions.map((action) => {
    if (action.kind === 'pool-clue') return action;
    let seed = action.kind === 'promote-seed' ? seedById.get(action.id) : undefined;
    if (action.kind === 'review-execution' || action.kind === 'deliver-execution') {
      const execution = executionById.get(action.id);
      seed = execution ? seedById.get(execution.seedId) : undefined;
    }
    if (!seed) return action;
    const linkedBodies = (seed.links ?? [])
      .map((link) => bodyByClue.get(link.clueId) ?? '')
      .filter(Boolean);
    return {
      ...action,
      summary: humanizeSeedSummary(seed.title, linkedBodies),
    };
  });
}

export interface PlanNext {
  generatedAt: string;
  actions: NextAction[];
}
