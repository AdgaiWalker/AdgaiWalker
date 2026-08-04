import { Inject, Injectable } from '@nestjs/common';
import {
  ACTION_KINDS,
  DEFAULT_LIST_LIMIT,
  normalizePlannedDate,
  transitionAction,
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

  async create(input: { title?: string; note?: string; kind?: string; plannedDate?: string | null }) {
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
    return this.actions.create({
      id: newId(),
      title,
      note: input.note?.trim() || null,
      kind,
      entityType: null,
      entityId: null,
      plannedDate,
      source: 'HUMAN',
    });
  }

  async update(id: string, input: { title?: string; note?: string | null; plannedDate?: string | null }) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const action = await this.actions.findById(id);
    if (!action) throw validationError('action-not-found');
    if (input.title !== undefined && !input.title.trim()) throw validationError('action-title-required');
    let plannedDate: string | null | undefined = undefined;
    if (input.plannedDate !== undefined) {
      try { plannedDate = normalizePlannedDate(input.plannedDate); }
      catch (error) { throw validationError(error instanceof Error ? error.message : 'invalid-planned-date'); }
    }
    return this.actions.update(id, {
      title: input.title?.trim(),
      note: input.note === undefined ? undefined : input.note?.trim() || null,
      plannedDate,
    });
  }

  async complete(id: string) {
    return this.setCompletion(id, 'complete');
  }

  async reopen(id: string) {
    return this.setCompletion(id, 'reopen');
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
}
