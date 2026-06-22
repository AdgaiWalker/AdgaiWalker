/**
 * domain/workitem/rules —— WorkItem 领域纯规则
 *
 * 从 `src/services/workbench.service.ts` 搬迁：
 * - `hasSufficientEvidence`（原 L76-78）
 * - `isProposalExpired`（原 L58-60，**参数化**：去掉 `now` 默认值，强制显式入参，GC5）
 * - `filterExpiredProposals`（原 getTodayProjection L460 的 filter 提取为独立函数）
 *
 * 全部纯函数，零 IO 依赖（GC5）。
 *
 * 注意（hai-razor）：
 * - `isProposalExpired` 的 `now` 必须由调用方显式传入 ISO 字符串；
 *   domain 层不调用 `new Date()` / `Date.now()`，保证可测试与可重放。
 */

import type { EvidenceRef, WorkItem } from '@/stores/ports';

/**
 * 判定证据是否足够进入 pending / accepted（hai-razor 信任边界 #1）。
 *
 * 规则：至少一条 `qualityStatus !== 'unverified'` 且 `summary` 非空的证据。
 * 纯 `unverified` 证据的 proposal 只能停在 proposal，不能进入待决定队列。
 *
 * @param evidenceRefs 待校验的证据引用数组
 */
export function hasSufficientEvidence(evidenceRefs: EvidenceRef[]): boolean {
  return evidenceRefs.some(ref => ref.qualityStatus !== 'unverified' && ref.summary.trim().length > 0);
}

/**
 * 判定一个 WorkItem 是否为"已过期的 proposal"（P4 安全护栏）。
 *
 * 规则：仅 `proposal` 状态有过期概念；当 `expiresAt < now` 时视为过期。
 * 过期 proposal 仍保留在存储供审计，但退出"今日/立即处理"活跃投影。
 *
 * 参数化（GC5）：`now` 必须显式传入（ISO 字符串），不在 domain 层默认 `nowIso()`。
 * service 层负责从 `WorkItemClock.now()` 或 `new Date().toISOString()` 取值后传入。
 *
 * @param item 待判定的 WorkItem
 * @param now  当前时间的 ISO 字符串（如 `new Date().toISOString()`）
 */
export function isProposalExpired(item: WorkItem, now: string): boolean {
  return item.status === 'proposal' && typeof item.expiresAt === 'string' && item.expiresAt < now;
}

/**
 * 从列表中过滤掉已过期的 proposal（用于 getTodayProjection 等活跃投影）。
 *
 * 非 proposal 状态、未设置 expiresAt、或 expiresAt >= now 的项都会保留。
 *
 * @param items 待过滤的 WorkItem 列表
 * @param now   当前时间的 ISO 字符串
 */
export function filterExpiredProposals(items: WorkItem[], now: string): WorkItem[] {
  return items.filter(item => !isProposalExpired(item, now));
}
