/**
 * domain/workitem/types —— WorkItem 领域层的依赖注入接口与结果类型骨架
 *
 * 设计目标（hai-razor）：把 WorkItem 的状态/规则/建议从 IO 边界（service）剥离到纯领域层。
 * 这里只定义类型契约（deps 注入 + 结果），不实现任何 apply 函数（apply 是后续 Task）。
 *
 * 红线（GC5）：本文件零 IO 依赖。
 * - 不 import `@/conversation/store`，不直接调 `getRedis`/`Date.now`/`crypto.randomUUID`。
 * - 类型只从 `@/stores/ports` 只读 import（无运行时依赖）。
 * - 时间通过 `WorkItemClock.now()` 注入，ID 通过 `WorkItemIdGenerator` 注入，
 *   保证领域层所有逻辑都是纯函数、可测试、可重放。
 */

import type { WorkItem } from '@/stores/ports';

/**
 * 时间源端口 —— 把"现在几点"从 `Date.now()` 抽离为可注入的纯接口。
 *
 * 领域规则（如 isProposalExpired）需要"当前时间"做判断，但不应直接依赖系统时钟，
 * 否则测试需要 mock 全局时间、无法重放。所有需要时间的 domain 函数都接受 `now` 入参
 * （ISO 字符串），由 service 层从 `WorkItemClock.now()` 取值后传入。
 */
export interface WorkItemClock {
  /** 返回当前时间的 ISO 字符串（如 `new Date().toISOString()`） */
  now(): string;
}

/**
 * ID 生成器端口 —— 把唯一标识从 `crypto.randomUUID()` 抽离为可注入的纯接口。
 *
 * 领域的 apply 函数（Task 3+）在创建 WorkItem / 历史 / 行动 / 结果时需要生成 ID，
 * 但不应直接调用 `randomUUID`，否则无法在测试里断言固定 ID、也无法重放历史。
 */
export interface WorkItemIdGenerator {
  /** 生成 WorkItem 主键 */
  workItemId(): string;
  /** 生成 append-only 历史条目主键 */
  historyId(): string;
  /** 生成 Action 主键 */
  actionId(): string;
  /** 生成 Outcome 主键 */
  outcomeId(): string;
}

/**
 * 领域层依赖集合 —— 所有 apply 函数（Task 3+）通过这个接口拿到时钟和 ID 生成器。
 *
 * service 层负责把真实实现（`new Date().toISOString()` / `randomUUID()`）传进来；
 * 测试层传 mock 实现，固定时间与 ID，使领域逻辑完全可重放。
 */
export interface WorkItemDeps {
  /** 时间源（默认从 service 层注入真实时钟） */
  clock: WorkItemClock;
  /** ID 生成器（默认从 service 层注入真实 randomUUID） */
  idGen: WorkItemIdGenerator;
}

/**
 * 领域函数统一结果类型 —— 成功带更新后的 WorkItem，失败带机器可读 code。
 *
 * 注意：领域层的失败 code 与 `WorkbenchResultCode`（service 层）刻意保持一致子集，
 * 这样 service 层可以原样透传，不需要做翻译层。
 *
 * 此处仅建类型骨架，具体 apply 函数（applyCreateProposal / applyDecide / ...）
 * 是 Task 3/4 的范围，本 Task 不实现（YAGNI）。
 */
export type WorkItemDomainResult =
  | { ok: true; workItem: WorkItem }
  | { ok: false; code: WorkItemDomainErrorCode; message: string };

/**
 * 领域层失败 code（与 service 层 `WorkbenchResultCode` 保持可透传的子集对齐）
 *
 * 只列 apply 函数会在领域层判定出的失败；IO 相关（storage-unavailable / not-found）
 * 由 service/repository 层负责，不进领域层。
 */
export type WorkItemDomainErrorCode =
  | 'invalid-input'
  | 'invalid-transition'
  | 'missing-evidence'
  | 'missing-expected-outcome';
