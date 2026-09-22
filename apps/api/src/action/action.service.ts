import { Inject, Injectable } from '@nestjs/common';
import {
  ACTION_ENTITY_TYPES,
  ACTION_KINDS,
  DEFAULT_LIST_LIMIT,
  normalizePlannedDate,
  transitionAction,
  type ActionEntityType,
  type ActionKind,
  type ActionStatus,
} from '@walker/shared';
import { newId } from '../common/ids';
import { storageUnavailable, validationError } from '../common/http-error';
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
    /** 可选实体引用（PRD-B 发布日历：'CONTENT' + 内容 slug）；不传即与现状一致（null） */
    entityType?: string;
    entityId?: string;
  }) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
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
    return this.actions.create({
      id: newId(),
      title,
      note: input.note?.trim() || null,
      kind,
      entityType,
      entityId,
      plannedDate,
      source: 'HUMAN',
    });
  }

  async update(
    id: string,
    input: {
      title?: string;
      note?: string | null;
      plannedDate?: string | null;
      /** 可选实体引用；仅当显式传入时改写（缺省保持原值） */
      entityType?: string;
      entityId?: string;
    },
  ) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
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
    return this.actions.update(id, {
      title: input.title?.trim(),
      note: input.note === undefined ? undefined : input.note?.trim() || null,
      plannedDate,
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
