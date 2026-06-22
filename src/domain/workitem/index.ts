/**
 * domain/workitem —— WorkItem 领域纯函数模块入口
 *
 * 集中 re-export 本模块的类型骨架与纯函数，供 service 层（`workbench.service.ts`）
 * 与后续 Task 的 apply 函数引用。本模块零 IO 依赖（GC5）。
 */

export type {
  WorkItemClock,
  WorkItemIdGenerator,
  WorkItemDeps,
  WorkItemDomainResult,
  WorkItemDomainErrorCode,
} from './types';

export { ALLOWED_TRANSITIONS, canTransition } from './state-machine';
export { hasSufficientEvidence, isProposalExpired, filterExpiredProposals } from './rules';
export { suggestNextAction } from './suggest-next-action';
export type { NextActionSuggestion } from './suggest-next-action';
// Task 3 + Task 4：7 个 apply 函数（纯，deps 注入，统一调 canTransition）
export {
  applyCreateProposal,
  applyRequestDecision,
  applyDecide,
  applyCreateAction,
  applyUpdateAction,
  applyRecordOutcome,
  applyOverridePriority,
} from './apply';
