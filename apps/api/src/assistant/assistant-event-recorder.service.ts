import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { AssistantEventRecordInput, AssistantEventSpoolHealth, AssistantEventSpoolPort } from '../ports/assistant-event-spool.port';
import { ASSISTANT_EVENT_SPOOL } from '../ports/assistant-event-spool.port';
import type { ConversationRepositoryPort } from '../ports/conversation.repository';
import { CONVERSATION_REPOSITORY } from '../ports/conversation.repository';
import type { AssistantEventRecorderPort, AssistantEventRecordResult } from '../ports/assistant-event-recorder.port';
import type { LogResourceRepositoryPort } from '../ports/log-resource.repository';
import { LOG_RESOURCE_REPOSITORY } from '../ports/log-resource.repository';

const REPLAY_BATCH_SIZE = 100;
const REPLAY_INTERVAL_MS = 30_000;
const DATABASE_WRITE_BUDGET_MS = 250;

@Injectable()
export class AssistantEventRecorder implements AssistantEventRecorderPort, OnModuleInit, OnModuleDestroy {
  private replayTimer: ReturnType<typeof setInterval> | null = null;
  private replayInFlight: Promise<{ replayed: number; pending: number | null }> | null = null;

  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly repository: ConversationRepositoryPort,
    @Inject(ASSISTANT_EVENT_SPOOL) private readonly spool: AssistantEventSpoolPort,
    @Inject(LOG_RESOURCE_REPOSITORY) private readonly resources: LogResourceRepositoryPort,
  ) {}

  onModuleInit(): void {
    void this.replayOnce();
    this.replayTimer = setInterval(() => { void this.replayOnce(); }, REPLAY_INTERVAL_MS);
    this.replayTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.replayTimer) clearInterval(this.replayTimer);
  }

  async record(event: AssistantEventRecordInput): Promise<AssistantEventRecordResult> {
    if (event.conversationId && await this.hasTombstone(event.conversationId)) {
      return { recorded: false, duplicate: false, queued: false };
    }
    const outcome = await this.writeToDatabase(event);
    if (outcome) {
      return { recorded: outcome === 'recorded', duplicate: outcome === 'duplicate', queued: false };
    }
    try {
      const queued = await this.spool.enqueue(event);
      return {
        recorded: false,
        duplicate: queued === 'duplicate',
        queued: queued === 'queued' || queued === 'duplicate',
      };
    } catch {
      return { recorded: false, duplicate: false, queued: false };
    }
  }

  replayOnce(): Promise<{ replayed: number; pending: number | null }> {
    if (this.replayInFlight) return this.replayInFlight;
    const replay = this.replayBatch().finally(() => { this.replayInFlight = null; });
    this.replayInFlight = replay;
    return replay;
  }

  health(): Promise<AssistantEventSpoolHealth> {
    return this.spool.health();
  }

  private async replayBatch(): Promise<{ replayed: number; pending: number | null }> {
    let entries;
    try {
      entries = await this.spool.readBatch(REPLAY_BATCH_SIZE);
    } catch {
      return { replayed: 0, pending: null };
    }
    let replayed = 0;
    for (const entry of entries) {
      if (entry.event.conversationId) {
        try {
          if (await this.resources.hasDeletionTombstone(entry.event.conversationId)) {
            await this.spool.remove([entry.event.eventId]);
            continue;
          }
        } catch {
          break;
        }
      }
      const outcome = await this.writeToDatabase(entry.event);
      if (outcome) {
        try {
          await this.spool.remove([entry.event.eventId]);
        replayed += 1;
        } catch {
          break;
        }
      } else {
        break;
      }
    }
    const health = await this.spool.health().catch(() => null);
    return { replayed, pending: health?.queuedCount ?? null };
  }

  private async hasTombstone(conversationId: string): Promise<boolean> {
    try {
      return await this.resources.hasDeletionTombstone(conversationId);
    } catch {
      return false;
    }
  }

  private async writeToDatabase(event: AssistantEventRecordInput): Promise<'recorded' | 'duplicate' | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), DATABASE_WRITE_BUDGET_MS);
      timer.unref?.();
    });
    const write = Promise.resolve().then(() => this.repository.recordEvent(event)).catch(() => null);
    const result = await Promise.race([write, timeout]);
    if (timer) clearTimeout(timer);
    return result;
  }
}
