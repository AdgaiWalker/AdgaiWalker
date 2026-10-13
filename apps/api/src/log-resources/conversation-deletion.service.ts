import { HttpStatus, Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ApiError } from '../common/http-error';
import { newId } from '../common/ids';
import type { AgentExecutionRepositoryPort } from '../ports/agent-execution.repository';
import { AGENT_EXECUTION_REPOSITORY } from '../ports/agent-execution.repository';
import type { ConversationDeletionRepositoryPort } from '../ports/conversation-deletion.repository';
import { CONVERSATION_DELETION_REPOSITORY } from '../ports/conversation-deletion.repository';
import type { LogResourceCleanerPort } from '../ports/log-resource-cleaner.port';
import { LOG_RESOURCE_CLEANER } from '../ports/log-resource-cleaner.port';
import type { DeletionTombstoneRecord, LogResourceRepositoryPort, LogResourceRecord } from '../ports/log-resource.repository';
import { LOG_RESOURCE_REPOSITORY } from '../ports/log-resource.repository';
import type { OperationsJournalPort } from '../ports/operations-journal.port';
import { OPERATIONS_JOURNAL } from '../ports/operations-journal.port';
import { LogResourceService } from './log-resource.service';
import type { DeletionManifestPort } from '../ports/deletion-manifest.port';
import { DELETION_MANIFEST } from '../ports/deletion-manifest.port';
import type { AgentExecutionService } from '../execution/agent-execution.service';
import { AgentExecutionService as AGENT_EXECUTION_SERVICE } from '../execution/agent-execution.service';

import { TERMINAL_RUN_STATES } from '@walker/shared';

const RESUME_INTERVAL_MS = 30_000;
/**
 * 只有这三个终态能证明"进程已经退出、不会再写文件"（复用 shared TERMINAL_RUN_STATES）。
 * 刻意**不含 UNKNOWN**：UNKNOWN 的语义正是"没能证明退出"，删除不能拿它当停住。
 */
const PROVEN_STOPPED_RUN_STATES = new Set<string>(TERMINAL_RUN_STATES);
export const FILE_RESOURCE_TYPES = new Set(['native-session', 'native-fork', 'trace', 'assistant-event-spool', 'export']);
const RESOURCE_ORDER: Record<string, number> = {
  export: -1,
  'native-fork': 0,
  'native-session': 1,
  trace: 2,
  'assistant-event-spool': 3,
  event: 4,
  message: 5,
  'assistant-run': 6,
  'execution-event': 7,
  'execution-run': 8,
  'daily-aggregate': 9,
};

export type DeletionTaskView = Pick<DeletionTombstoneRecord,
  'id' | 'conversationId' | 'state' | 'attempts' | 'lastErrorCode' | 'requestedAt' | 'updatedAt' | 'completedAt'>;

@Injectable()
export class ConversationDeletionService implements OnModuleInit, OnModuleDestroy {
  private readonly inFlight = new Map<string, Promise<DeletionTaskView>>();
  private resumeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(OPERATIONS_JOURNAL) private readonly journal: OperationsJournalPort,
    @Inject(LOG_RESOURCE_REPOSITORY) private readonly resources: LogResourceRepositoryPort,
    @Inject(CONVERSATION_DELETION_REPOSITORY) private readonly deletionRepository: ConversationDeletionRepositoryPort,
    @Inject(LogResourceService) private readonly logResources: LogResourceService,
    @Inject(LOG_RESOURCE_CLEANER) private readonly fileCleaner: LogResourceCleanerPort,
    @Inject(AGENT_EXECUTION_REPOSITORY) private readonly runs: AgentExecutionRepositoryPort,
    @Inject(AGENT_EXECUTION_SERVICE) private readonly execution: AgentExecutionService,
    @Inject(DELETION_MANIFEST) private readonly manifest: DeletionManifestPort,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.WALKER_STARTUP_RECONCILIATION !== '1') await this.resumePending();
    this.resumeTimer = setInterval(() => { void this.resumePending(); }, RESUME_INTERVAL_MS);
    this.resumeTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.resumeTimer) clearInterval(this.resumeTimer);
  }

  async requestDelete(conversationId: string, actor = 'owner'): Promise<DeletionTaskView> {
    let tombstone = await this.resources.tombstoneForConversation(conversationId);
    if (!tombstone) {
      const conversation = await this.deletionRepository.conversation(conversationId);
      if (!conversation) throw new ApiError('conversation-not-found', HttpStatus.NOT_FOUND, '找不到这个会话');
      try {
        tombstone = await this.journal.transaction(async (tx) => {
          const ensured = await tx.ensureDeletionTombstone(newId(), conversationId);
          if (ensured.created) {
            await tx.appendAudit({
              id: newId(), actor, action: 'conversation-delete-requested',
              targetType: 'conversation', targetId: conversationId, outcome: 'pending',
            });
          }
          return ensured.tombstone;
        });
      } catch (error) {
        // A concurrent DELETE may have committed the unique tombstone first.
        tombstone = await this.resources.tombstoneForConversation(conversationId).catch(() => null);
        if (!tombstone) throw error;
      }
    }
    if (tombstone.state === 'completed') return this.view(tombstone);
    return this.process(tombstone.id);
  }

  async taskStatus(id: string): Promise<DeletionTaskView> {
    const tombstone = await this.resources.tombstone(id);
    if (!tombstone) throw new ApiError('deletion-task-not-found', HttpStatus.NOT_FOUND, '找不到删除任务');
    return this.view(tombstone);
  }

  async resumePending(): Promise<void> {
    const pending = await this.resources.pendingTombstones(20).catch(() => []);
    for (const tombstone of pending) {
      await this.process(tombstone.id).catch(() => undefined);
    }

    /**
     * 迟到补写清扫（G02 失败点：补写与删除竞争）。
     *
     * `pendingTombstones` 只返回未完成态，所以**已完成的墓碑不会再被访问**——
     * 删除完成后若旧路径又写入资源登记，那条记录会永远残留，与「删除事实一致」相矛盾。
     *
     * 这里只清理**删除完成之后**才登记的资源（registeredAt > completedAt），
     * 不重跑整段删除、不回退墓碑终态、不触碰删除前存在的任何数据。
     */
    const lateWrites = await this.resources.lateWriteResources(50).catch(() => []);
    for (const { resource } of lateWrites) {
      await this.removeLateResource(resource).catch(() => undefined);
    }
  }

  /** 清除单条迟到补写资源：文件 + 数据库正文 + 资源登记，保持删除事实稳定。 */
  private async removeLateResource(resource: LogResourceRecord): Promise<void> {
    if (FILE_RESOURCE_TYPES.has(resource.resourceType)) await this.fileCleaner.remove(resource);
    await this.deletionRepository.deleteDatabaseResource(resource);
    await this.resources.deleteResourceRecord(resource.id);
  }

  private process(id: string): Promise<DeletionTaskView> {
    const current = this.inFlight.get(id);
    if (current) return current;
    const work = this.processOnce(id).finally(() => { this.inFlight.delete(id); });
    this.inFlight.set(id, work);
    return work;
  }

  private async processOnce(id: string): Promise<DeletionTaskView> {
    let tombstone = await this.resources.tombstone(id);
    if (!tombstone) throw new ApiError('deletion-task-not-found', HttpStatus.NOT_FOUND, '找不到删除任务');
    if (tombstone.state === 'completed') return this.view(tombstone);

    try {
      await this.manifest.record({
        tombstoneId: tombstone.id,
        conversationId: tombstone.conversationId,
        requestedAt: tombstone.requestedAt.toISOString(),
      });
    } catch {
      const blocked = await this.resources.updateTombstone({
        id, state: 'blocked', lastErrorCode: 'deletion-manifest-write-failed',
      });
      return this.view(blocked);
    }

    tombstone = await this.resources.updateTombstone({
      id, state: 'stopping', incrementAttempts: true, lastErrorCode: null,
    });
    try {
      const conversation = await this.deletionRepository.conversation(tombstone.conversationId);
      const currentResources = await this.logResources.resourcesForConversation(tombstone.conversationId);
      if (conversation) await this.stopRuns(conversation, currentResources);

      await this.resources.updateTombstone({ id, state: 'deleting', lastErrorCode: null });
      const resources = (await this.logResources.resourcesForConversation(tombstone.conversationId))
        .sort((left, right) => (RESOURCE_ORDER[left.resourceType] ?? 100) - (RESOURCE_ORDER[right.resourceType] ?? 100));
      for (const resource of resources) {
        if (FILE_RESOURCE_TYPES.has(resource.resourceType)) await this.fileCleaner.remove(resource);
        await this.deletionRepository.deleteDatabaseResource(resource);
        await this.resources.deleteResourceRecord(resource.id);
      }

      const remaining = await this.logResources.resourcesForConversation(tombstone.conversationId);
      if (remaining.length > 0) throw new Error('conversation-resources-remain');
      await this.deletionRepository.finalizeConversation(tombstone.conversationId, id);
      return this.view((await this.resources.tombstone(id))!);
    } catch (error) {
      const lastErrorCode = deletionErrorCode(error);
      const blocked = await this.resources.updateTombstone({ id, state: 'blocked', lastErrorCode });
      return this.view(blocked);
    }
  }

  private async stopRuns(
    conversation: NonNullable<Awaited<ReturnType<ConversationDeletionRepositoryPort['conversation']>>>,
    resources: LogResourceRecord[],
  ): Promise<void> {
    const ids = new Set([
      ...conversation.runIds,
      ...resources.filter((resource) => resource.resourceType === 'execution-run').map((resource) => resource.resourceKey),
    ]);
    for (const runId of ids) {
      const run = await this.runs.findById(runId);
      if (!run) continue;
      if (PROVEN_STOPPED_RUN_STATES.has(run.state)) continue;
      if (run.origin !== 'public') throw new Error('conversation-run-owner-conflict');
      const stopped = await this.execution.stopPublicRun(runId, conversation.anonId, conversation.placementKey, conversation.scopeSlug);
      if (stopped.outcome === 'isolated' || !PROVEN_STOPPED_RUN_STATES.has(stopped.state)) {
        throw new Error('runtime-stop-unconfirmed');
      }
    }
  }

  private view(tombstone: DeletionTombstoneRecord): DeletionTaskView {
    return {
      id: tombstone.id,
      conversationId: tombstone.conversationId,
      state: tombstone.state,
      attempts: tombstone.attempts,
      lastErrorCode: tombstone.lastErrorCode,
      requestedAt: tombstone.requestedAt,
      updatedAt: tombstone.updatedAt,
      completedAt: tombstone.completedAt,
    };
  }
}

function deletionErrorCode(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  const known = [
    'runtime-stop-unconfirmed',
    'conversation-run-owner-conflict',
    'conversation-run-not-stopped',
    'conversation-resources-remain',
    'native-session-revision-missing',
    'native-session-revision-not-found',
    'resource-path-outside-root',
    'resource-path-symlink',
    'resource-root-not-directory',
    'conversation-deletion-pending',
    'export-resource-cleanup-not-implemented',
  ];
  return known.find((item) => code.includes(item)) ?? 'resource-cleanup-failed';
}
