/**
 * 代码结构债务的「身份」与对账 —— 纯函数，无 IO。
 *
 * 门禁（scripts/verify-architecture）与 admin 内部视图都要回答同一个问题：
 * 「基线里记着的那些，现在还有哪些、又多了哪些」。**各写一遍就是两套口径**，
 * 一处升级另一处就会悄悄说错话，所以收在这里。
 *
 * 关键词是**稳定身份**（key）：顺序变化、引入方增加、说明符重排都不该被当成新债务。
 * 否则门禁天天报「新增」而其实什么都没变，很快就会没人看它。
 */
import type { CodeGraphHealth } from './code-graph.js';

/** 基线（`scripts/architecture-baseline.json` 的 accepted 段）的形状 */
export type AcceptedCodeDebt = {
  cycles: string[][];
  unresolved: string[];
  unreachable: string[];
  reverseDependencies: Array<{ from: string; to: string }>;
};

export type CodeDebtCategory =
  | 'cycles'
  | 'unresolved'
  | 'unreachable'
  | 'reverseDependencies';

export const CODE_DEBT_CATEGORIES: readonly CodeDebtCategory[] = [
  'cycles',
  'unresolved',
  'unreachable',
  'reverseDependencies',
];

export type CodeDebtItem = {
  category: CodeDebtCategory;
  /** 稳定身份，用于与基线逐条比对 */
  key: string;
  /** 给人看的说明（可能带引入方等上下文） */
  detail: string;
};

/** 环的身份：成员排序后拼接 —— 起点不同、顺序不同都算同一个环 */
export function cycleDebtKey(members: readonly string[]): string {
  return [...members].sort().join(' → ');
}

/** 反向依赖的身份 */
export function reverseDebtKey(item: { from: string; to: string }): string {
  return `${item.from} → ${item.to}`;
}

/** 把体检结果摊成可比对的债务清单 */
export function codeDebtItems(
  health: Pick<
    CodeGraphHealth,
    'cycles' | 'unresolved' | 'unreachable' | 'reverseDependencies'
  >,
): CodeDebtItem[] {
  const items: CodeDebtItem[] = [];
  for (const members of health.cycles) {
    items.push({
      category: 'cycles',
      key: cycleDebtKey(members),
      detail: members.join(' → '),
    });
  }
  for (const entry of health.unresolved) {
    items.push({
      category: 'unresolved',
      key: entry.specifier,
      // 基线只记说明符（引入方会变，不属于债务身份），故可能没有引入方可列
      detail: entry.importers.length
        ? `${entry.specifier} ← ${entry.importers.join('、')}`
        : entry.specifier,
    });
  }
  for (const path of health.unreachable) {
    items.push({ category: 'unreachable', key: path, detail: path });
  }
  for (const entry of health.reverseDependencies) {
    items.push({
      category: 'reverseDependencies',
      key: reverseDebtKey(entry),
      detail: reverseDebtKey(entry),
    });
  }
  return items;
}

/** 从体检结果里取出现存的全部债务（写基线时用） */
export function acceptedDebtFromHealth(
  health: Pick<
    CodeGraphHealth,
    'cycles' | 'unresolved' | 'unreachable' | 'reverseDependencies'
  >,
): AcceptedCodeDebt {
  return {
    cycles: health.cycles,
    unresolved: health.unresolved.map((entry) => entry.specifier),
    unreachable: health.unreachable,
    reverseDependencies: health.reverseDependencies,
  };
}

/** 把基线形状摊成同一套债务清单 */
export function acceptedDebtItems(accepted: AcceptedCodeDebt): CodeDebtItem[] {
  return codeDebtItems({
    cycles: accepted.cycles,
    unresolved: accepted.unresolved.map((specifier) => ({
      specifier,
      // 基线只记说明符（引入方会变，不是债务身份的一部分）
      importers: [],
    })),
    unreachable: accepted.unreachable,
    reverseDependencies: accepted.reverseDependencies,
  });
}

export type CodeDebtDiff = {
  /** 现在有、基线里没有 —— 门禁据此失败 */
  added: CodeDebtItem[];
  /** 基线里有、现在已经没了 —— 可以收敛基线 */
  resolved: CodeDebtItem[];
  /** 分类计数，供报告与卡片展示 */
  categories: Array<{
    category: CodeDebtCategory;
    accepted: number;
    current: number;
    added: number;
    resolved: number;
  }>;
};

/** 以稳定身份逐条对账 */
export function diffCodeDebt(
  current: AcceptedCodeDebt,
  accepted: AcceptedCodeDebt,
): CodeDebtDiff {
  const currentItems = acceptedDebtItems(current);
  const acceptedItems = acceptedDebtItems(accepted);

  const currentKeys = new Set(currentItems.map((item) => `${item.category}\u0000${item.key}`));
  const acceptedKeys = new Set(acceptedItems.map((item) => `${item.category}\u0000${item.key}`));

  const added = currentItems.filter(
    (item) => !acceptedKeys.has(`${item.category}\u0000${item.key}`),
  );
  // 已还清的展示用基线里的 detail（现存清单里已经没有它了）
  const resolved = acceptedItems.filter(
    (item) => !currentKeys.has(`${item.category}\u0000${item.key}`),
  );

  return {
    added,
    resolved,
    categories: CODE_DEBT_CATEGORIES.map((category) => ({
      category,
      accepted: acceptedItems.filter((item) => item.category === category).length,
      current: currentItems.filter((item) => item.category === category).length,
      added: added.filter((item) => item.category === category).length,
      resolved: resolved.filter((item) => item.category === category).length,
    })),
  };
}
