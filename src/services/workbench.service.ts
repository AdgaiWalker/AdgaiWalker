/**
 * Workbench Service —— WorkItem 决策聚合的薄编排层（P0-B/C / hai-razor 包 B）
 *
 * 职责（Task 6 收口）：
 * - service 是 IO 编排层：`ensureWritable → findById → apply* → save`。
 * - 状态迁移的信任边界校验、history 构造、状态机白名单判断已剥离到
 *   `@/domain/workitem`（apply.ts / state-machine.ts / rules.ts，纯函数，零 IO 依赖，GC5）。
 * - service 只保留真值获取：时钟（nowIso）、ID 生成（makeId）、存储读写（repository）、
 *   存储模式判定（resolveWorkbenchStorageMode / ensureWritable）。
 * - 把 `nowIso` / `makeId` 包成 `WorkItemDeps` 注入 domain apply，保证领域逻辑可测试、可重放。
 *
 * hai-razor 信任边界守护（现由 domain apply 实现，service 透传失败 code）：
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
  WorkItem,
  WorkItemRepositoryPort,
} from '@/stores/ports';
import { createWorkItemStore } from '@/stores/work-item.store';
import { resolveStorageMode } from '@/lib/storage-mode';

// domain/workitem 纯函数模块（GC5：零 IO 依赖）
// - apply.ts（Task 3/4）：7 个迁移的 apply 函数，签名 (current, input, deps) → WorkItemDomainResult
// - rules.ts：filterExpiredProposals（getTodayProjection / list 默认过滤过期 AI proposal）
import {
  applyCreateAction,
  applyCreateProposal,
  applyDecide,
  applyOverridePriority,
  applyRecordOutcome,
  applyRequestDecision,
  applyUpdateAction,
  filterExpiredProposals,
} from '@/domain/workitem';
import type { WorkItemDeps } from '@/domain/workitem';

import type {
  CreateActionInput,
  CreateProposalInput,
  DecideInput,
  RecordOutcomeInput,
  UpdateActionInput,
  WorkbenchResult,
  WorkbenchServicePort,
} from './interfaces';

const WORKITEM_ID_PREFIX = 'wi';

function nowIso(): string {
  return new Date().toISOString();
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

function fail<T = void>(code: WorkbenchResult['code'], message: string): WorkbenchResult<T> {
  return { ok: false, code, message };
}

function ok<T>(data: T): WorkbenchResult<T> {
  return { ok: true, code: 'ok', data };
}

export class WorkbenchService implements WorkbenchServicePort {
  constructor(options?: { repository?: WorkItemRepositoryPort; storageMode?: StorageMode | (() => StorageMode) }) {
    this.repository = options?.repository ?? createWorkItemStore();
    const mode = options?.storageMode;
    this.resolveMode = typeof mode === 'function' ? mode : () => mode ?? resolveWorkbenchStorageMode();
    // GC4：options bag 形状不变；内部新增 deps（clock + idGen），把 IO 真值获取留在 service。
    this.deps = {
      clock: { now: () => nowIso() },
      idGen: {
        workItemId: () => makeId(WORKITEM_ID_PREFIX),
        historyId: () => makeId('wh'),
        actionId: () => makeId('wa'),
        outcomeId: () => makeId('wo'),
      },
    };
  }

  private readonly repository;
  private readonly resolveMode;
  private readonly deps: WorkItemDeps;

  private ensureWritable<T>(): WorkbenchResult<T> | null {
    if (this.resolveMode() === 'unavailable') {
      return fail('storage-unavailable', '生产环境缺少持久化存储，无法写入工作项。');
    }
    return null;
  }

  async createProposal(input: CreateProposalInput): Promise<WorkbenchResult<WorkItem>> {
    // createProposal 是新建（无 current）：信任边界校验由 applyCreateProposal 内部完成
    // （title 空 → invalid-input；evidenceRefs 空 → missing-evidence；AI+now+无证据 → invalid-input）。
    const blocked = this.ensureWritable<WorkItem>();
    if (blocked) return blocked;
    const result = applyCreateProposal(input, this.deps);
    if (!result.ok) return result;
    await this.repository.save(result.workItem);
    return ok(result.workItem);
  }

  async requestDecision(workItemId: string, actor: string): Promise<WorkbenchResult<WorkItem>> {
    const blocked = this.ensureWritable<WorkItem>();
    if (blocked) return blocked;
    const existing = await this.repository.findById(workItemId);
    if (!existing) return fail('not-found', '工作项不存在。');
    const result = applyRequestDecision(existing, actor, this.deps);
    if (!result.ok) return result;
    await this.repository.save(result.workItem);
    return ok(result.workItem);
  }

  async decide(workItemId: string, input: DecideInput): Promise<WorkbenchResult<WorkItem>> {
    const blocked = this.ensureWritable<WorkItem>();
    if (blocked) return blocked;
    const existing = await this.repository.findById(workItemId);
    if (!existing) return fail('not-found', '工作项不存在。');
    const result = applyDecide(existing, input, this.deps);
    if (!result.ok) return result;
    await this.repository.save(result.workItem);
    return ok(result.workItem);
  }

  async createAction(workItemId: string, input: CreateActionInput): Promise<WorkbenchResult<WorkItem>> {
    const blocked = this.ensureWritable<WorkItem>();
    if (blocked) return blocked;
    const existing = await this.repository.findById(workItemId);
    if (!existing) return fail('not-found', '工作项不存在。');
    const result = applyCreateAction(existing, input, this.deps);
    if (!result.ok) return result;
    await this.repository.save(result.workItem);
    return ok(result.workItem);
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
    const result = applyUpdateAction(existing, actionId, input, this.deps);
    if (!result.ok) return result;
    await this.repository.save(result.workItem);
    return ok(result.workItem);
  }

  async recordOutcome(workItemId: string, input: RecordOutcomeInput): Promise<WorkbenchResult<WorkItem>> {
    const blocked = this.ensureWritable<WorkItem>();
    if (blocked) return blocked;
    const existing = await this.repository.findById(workItemId);
    if (!existing) return fail('not-found', '工作项不存在。');
    const result = applyRecordOutcome(existing, input, this.deps);
    if (!result.ok) return result;
    await this.repository.save(result.workItem);
    return ok(result.workItem);
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
    const existing = await this.repository.findById(workItemId);
    if (!existing) return fail('not-found', '工作项不存在。');
    const result = applyOverridePriority(existing, input, this.deps);
    if (!result.ok) return result;
    await this.repository.save(result.workItem);
    return ok(result.workItem);
  }

  async getTodayProjection(options?: { limit?: number }): Promise<WorkItem[]> {
    const items = await this.repository.listActive({ limit: options?.limit ?? 30 });
    // P4：过期的 AI/无证据 proposal 不进入"今日"投影（保留在存储供审计，不删除）
    // 纯函数 isProposalExpired / filterExpiredProposals 已抽到 domain/workitem/rules（GC5：零 IO），
    // service 层负责从 nowIso()（IO 边界）取当前时间传入。
    return filterExpiredProposals(items, nowIso());
  }

  async list(options?: Parameters<WorkbenchServicePort['list']>[0]): Promise<WorkItem[]> {
    const items = await this.repository.list(options);
    // BUG #3 修复：默认过滤过期 proposal，与 getTodayProjection 行为一致；
    // 过期 proposal 仍保留在存储供审计，仅在默认列表视图退出活跃投影。
    // 审计场景显式传 includeExpiredProposals:true 查看全部。
    return options?.includeExpiredProposals ? items : filterExpiredProposals(items, nowIso());
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
// 实现已搬迁至 `@/domain/workitem/suggest-next-action`（纯函数，零 IO 依赖）。
// 此处 re-export 保持调用方 `import { suggestNextAction } from '@/services/workbench.service'`
// 零改动（5 处调用方：workbench.service.test.ts + outcomes 页 + outcomes API + suggestNextAction 单测）。
// ---------------------------------------------------------------------------

export type { NextActionSuggestion } from '@/domain/workitem';
export { suggestNextAction } from '@/domain/workitem';
