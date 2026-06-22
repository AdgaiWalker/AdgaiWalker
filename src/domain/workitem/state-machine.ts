/**
 * domain/workitem/state-machine —— WorkItem 状态迁移白名单与判定
 *
 * 从 `src/services/workbench.service.ts` 搬迁（原 L89-102）。
 * 纯数据 + 纯函数，零 IO 依赖（GC5）。
 *
 * 作用：禁止跳跃式迁移（如 proposal→acting），便于审计与回放。
 * 所有状态迁移函数（service 层）在执行 mutate 前都必须先过 `canTransition`。
 */

import type { WorkItemStatus } from '@/stores/ports';

/**
 * 状态迁移白名单 —— key 是当前状态，value 是允许直接迁入的目标状态列表。
 *
 * 终态（resolved / rejected）为空数组，拒绝所有后继迁移。
 */
export const ALLOWED_TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  proposal: ['pending', 'accepted', 'rejected', 'paused'],
  pending: ['accepted', 'rejected', 'paused', 'proposal'],
  accepted: ['acting', 'paused', 'rejected'],
  rejected: [],
  paused: ['pending', 'proposal', 'rejected'],
  acting: ['awaiting-verification', 'resolved', 'paused'],
  'awaiting-verification': ['resolved', 'acting', 'paused'],
  resolved: [],
};

/**
 * 判定 `from → to` 是否为合法迁移。
 *
 * @param from 当前状态
 * @param to   目标状态
 * @returns 白名单内返回 true；否则 false（含 from===to 的"无变化"场景，也按非法处理）
 */
export function canTransition(from: WorkItemStatus, to: WorkItemStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
