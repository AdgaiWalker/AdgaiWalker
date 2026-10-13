import { Inject, Injectable } from '@nestjs/common';
import {
  ACTION_ENTITY_TYPES,
  ACTION_KINDS,
  DEFAULT_LIST_LIMIT,
  isUnsupportedRepeatRule,
  normalizePlannedDate,
  resolveActionDue,
  transitionAction,
  type ActionEntityType,
  type ActionKind,
  type ActionStatus,
} from '@walker/shared';
import { newId } from '../common/ids';
import { ApiError, storageUnavailable, validationError } from '../common/http-error';
import { ACTION_REPOSITORY, type ActionRepositoryPort } from '../ports/action.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

@Injectable()
export class ActionService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(ACTION_REPOSITORY) private readonly actions: ActionRepositoryPort,
  ) {}

  async list(input: { status?: string; kind?: string; limit?: number } = {}) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const status = input.status === undefined ? undefined : this.parseStatus(input.status);
    const kind = input.kind === undefined ? undefined : this.parseKind(input.kind);
    return this.actions.list({ status, kind, limit: input.limit ?? DEFAULT_LIST_LIMIT });
  }

  async create(input: {
    title?: string;
    note?: string;
    kind?: string;
    plannedDate?: string | null;
    /** 可选时区覆盖；缺省用站点默认（Asia/Shanghai） */
    timezone?: string | null;
    /** 预留的重复规则字段；首期未实现，带值即拒（绝不静默降级成单次） */
    repeat?: string | null;
    /** 可选实体引用（PRD-B 发布日历：'CONTENT' + 内容 slug）；不传即与现状一致（null） */
    entityType?: string;
    entityId?: string;
  }) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    // 重复规则未实现：带值必须明确拒绝，否则调用方以为设了周期提醒，实际只响一次
    if (isUnsupportedRepeatRule(input.repeat)) {
      throw new ApiError(
        'reminder-repeat-unsupported',
        501,
        '重复提醒规则尚未实现，当前仅支持单次提醒',
      );
    }
    const title = input.title?.trim() ?? '';
    if (!title) throw validationError('action-title-required');
    const kind = this.parseKind(input.kind ?? 'TASK');
    let plannedDate: string | null;
    try {
      plannedDate = normalizePlannedDate(input.plannedDate);
    } catch (error) {
      throw validationError(error instanceof Error ? error.message : 'invalid-planned-date');
    }
    const { entityType, entityId } = this.parseEntityRef(input.entityType, input.entityId);
    // 到期瞬时与生成时区一并落库：仅设日期的事项按站点时区当日 00:00 到期（O01）
    const due = this.resolveDue(plannedDate, input.timezone);
    return this.actions.create({
      id: newId(),
      title,
      note: input.note?.trim() || null,
      kind,
      entityType,
      entityId,
      plannedDate,
      dueAt: due.dueAt ? new Date(due.dueAt) : null,
      timezone: due.timezone,
      source: 'HUMAN',
    });
  }

  async update(
    id: string,
    input: {
      title?: string;
      note?: string | null;
      plannedDate?: string | null;
      timezone?: string | null;
      /** 预留的重复规则字段；首期未实现，带值即拒 */
      repeat?: string | null;
      /** 可选实体引用；仅当显式传入时改写（缺省保持原值） */
      entityType?: string;
      entityId?: string;
    },
  ) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    if (isUnsupportedRepeatRule(input.repeat)) {
      throw new ApiError(
        'reminder-repeat-unsupported',
        501,
        '重复提醒规则尚未实现，当前仅支持单次提醒',
      );
    }
    const action = await this.actions.findById(id);
    if (!action) throw validationError('action-not-found');
    if (input.title !== undefined && !input.title.trim()) throw validationError('action-title-required');
    let plannedDate: string | null | undefined = undefined;
    if (input.plannedDate !== undefined) {
      try { plannedDate = normalizePlannedDate(input.plannedDate); }
      catch (error) { throw validationError(error instanceof Error ? error.message : 'invalid-planned-date'); }
    }
    // 实体引用只在显式传入时进入 patch（可选参数：缺省即保持现状）
    const entityPatch: { entityType?: ActionEntityType | null; entityId?: string | null } = {};
    if (input.entityType !== undefined || input.entityId !== undefined) {
      const { entityType, entityId } = this.parseEntityRef(input.entityType, input.entityId);
      entityPatch.entityType = entityType;
      entityPatch.entityId = entityId;
    }
    // 改期必须原子重算到期瞬时：旧的 dueAt 不能残留，否则延后会触发旧到期（O03 前提）
    const duePatch: { dueAt?: Date | null; timezone?: string | null } = {};
    if (plannedDate !== undefined || input.timezone !== undefined) {
      const due = this.resolveDue(plannedDate === undefined ? action.plannedDate : plannedDate, input.timezone);
      duePatch.dueAt = due.dueAt ? new Date(due.dueAt) : null;
      duePatch.timezone = due.timezone;
    }
    return this.actions.update(id, {
      title: input.title?.trim(),
      note: input.note === undefined ? undefined : input.note?.trim() || null,
      plannedDate,
      ...duePatch,
      ...entityPatch,
    });
  }

  async complete(id: string) {
    return this.setCompletion(id, 'complete');
  }

  async reopen(id: string) {
    return this.setCompletion(id, 'reopen');
  }

  /** 删除排期：只删 Action 行，绝不触碰内容文件（PRD §4.4 末条） */
  async remove(id: string): Promise<{ id: string }> {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const action = await this.actions.findById(id);
    if (!action) throw validationError('action-not-found');
    await this.actions.delete(id);
    return { id };
  }

  private async setCompletion(id: string, event: 'complete' | 'reopen') {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const action = await this.actions.findById(id);
    if (!action) throw validationError('action-not-found');
    return this.actions.setCompletion(id, transitionAction(action.status, event, new Date()));
  }

  /** 到期换算的唯一入口：把共享规则的异常翻译成 {code,message} 校验错误 */
  private resolveDue(plannedDate: string | null | undefined, timezone?: string | null) {
    try {
      return resolveActionDue({ plannedDate, timezone });
    } catch (error) {
      throw validationError(error instanceof Error ? error.message : 'invalid-action-due');
    }
  }

  private parseKind(value: string): ActionKind {
    if (!ACTION_KINDS.includes(value as ActionKind)) throw validationError('invalid-action-kind');
    return value as ActionKind;
  }

  private parseStatus(value: string): ActionStatus {
    if (value !== 'OPEN' && value !== 'DONE') throw validationError('invalid-action-status');
    return value;
  }

  /**
   * 实体引用校验（fail-closed）：entityType 必须命中 shared 词表；且必须与 entityId 成对出现。
   * 不传（undefined）时按「无引用」处理，行为与既有调用方一致。
   */
  private parseEntityRef(
    rawType: string | undefined,
    rawId: string | undefined,
  ): { entityType: ActionEntityType | null; entityId: string | null } {
    const hasType = rawType !== undefined && rawType !== '';
    const entityId = rawId?.trim() || null;
    if (!hasType && !entityId) return { entityType: null, entityId: null };
    if (!hasType) throw validationError('invalid-action-entity-type');
    if (!(ACTION_ENTITY_TYPES as readonly string[]).includes(rawType)) {
      throw validationError('invalid-action-entity-type');
    }
    if (!entityId) throw validationError('action-entity-id-required');
    return { entityType: rawType as ActionEntityType, entityId };
  }
}
