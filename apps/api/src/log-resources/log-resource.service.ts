import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { validationError } from '../common/http-error';
import type { AssistantEventSpoolPort } from '../ports/assistant-event-spool.port';
import { ASSISTANT_EVENT_SPOOL } from '../ports/assistant-event-spool.port';
import type {
  LogResourceInput,
  LogResourceRecord,
  LogResourceRepositoryPort,
  LogRetentionPolicy,
} from '../ports/log-resource.repository';
import { LOG_RESOURCE_REPOSITORY } from '../ports/log-resource.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_DETAIL_RETENTION_DAYS = 90;
export const DEFAULT_AGGREGATE_RETENTION_DAYS = 365;

export type LogResourceView = LogResourceRecord & {
  expiresAt: string;
  expired: boolean;
};

@Injectable()
export class LogResourceService {
  constructor(
    @Inject(LOG_RESOURCE_REPOSITORY) private readonly resources: LogResourceRepositoryPort,
    @Inject(ASSISTANT_EVENT_SPOOL) private readonly spool: AssistantEventSpoolPort,
  ) {}

  async register(input: LogResourceInput): Promise<boolean> {
    if (input.conversationId && !input.allowDuringDeletion && await this.resources.hasDeletionTombstone(input.conversationId)) return false;
    await this.resources.register(input);
    return true;
  }

  async registerTrace(runId: string): Promise<boolean> {
    const run = await this.resources.find('execution-run', runId);
    return this.register({
      conversationId: run?.conversationId ?? null,
      resourceType: 'trace',
      resourceKey: runId,
      resourceCreatedAt: new Date(),
    });
  }

  async resourcesForConversation(conversationId: string, now = new Date()): Promise<LogResourceView[]> {
    const [policy, registered, spoolResources] = await Promise.all([
      this.getPolicy(),
      this.resources.forConversation(conversationId),
      this.spool.listResources(),
    ]);
    const records = registered.map((resource) => this.view(resource, policy, now));
    for (const queued of spoolResources) {
      if (queued.conversationId !== conversationId) continue;
      const resourceCreatedAt = new Date(queued.queuedAt);
      const expiresAt = new Date(resourceCreatedAt.getTime() + 24 * 60 * 60 * 1000);
      records.push({
        id: spoolResourceId(queued.eventId),
        conversationId,
        resourceType: 'assistant-event-spool',
        resourceKey: queued.eventId,
        agentRevisionId: null,
        parentKey: null,
        resourceCreatedAt,
        registeredAt: resourceCreatedAt,
        expiresAt: expiresAt.toISOString(),
        expired: expiresAt <= now,
      });
    }
    return records.sort((left, right) => left.resourceCreatedAt.getTime() - right.resourceCreatedAt.getTime());
  }

  async expiredResources(now = new Date(), limit = 500): Promise<LogResourceView[]> {
    const policy = await this.getPolicy();
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 1_000) : 500;
    const [registered, spoolResources] = await Promise.all([
      this.resources.expired({
        detailBefore: new Date(now.getTime() - policy.detailRetentionDays * DAY_MS),
        aggregateBefore: new Date(now.getTime() - policy.aggregateRetentionDays * DAY_MS),
        limit: safeLimit,
      }),
      this.spool.listResources(),
    ]);
    const expired = registered.map((resource) => this.view(resource, policy, now)).filter((resource) => resource.expired);
    for (const queued of spoolResources) {
      const resourceCreatedAt = new Date(queued.queuedAt);
      const expiresAt = new Date(resourceCreatedAt.getTime() + DAY_MS);
      if (expiresAt > now) continue;
      expired.push({
        id: spoolResourceId(queued.eventId),
        conversationId: queued.conversationId,
        resourceType: 'assistant-event-spool',
        resourceKey: queued.eventId,
        agentRevisionId: null,
        parentKey: null,
        resourceCreatedAt,
        registeredAt: resourceCreatedAt,
        expiresAt: expiresAt.toISOString(),
        expired: true,
      });
    }
    return expired
      .sort((left, right) => Date.parse(left.expiresAt) - Date.parse(right.expiresAt))
      .slice(0, safeLimit);
  }

  getPolicy(): Promise<LogRetentionPolicy> {
    return this.resources.getPolicy();
  }

  async updatePolicy(input: { detailRetentionDays: number; aggregateRetentionDays: number }): Promise<LogRetentionPolicy> {
    if (!Number.isInteger(input.detailRetentionDays) || input.detailRetentionDays < 1 || input.detailRetentionDays > DEFAULT_DETAIL_RETENTION_DAYS ||
        !Number.isInteger(input.aggregateRetentionDays) || input.aggregateRetentionDays < 1 || input.aggregateRetentionDays > DEFAULT_AGGREGATE_RETENTION_DAYS) {
      throw validationError('log-retention-invalid');
    }
    return this.resources.updatePolicy(input);
  }

  private view(resource: LogResourceRecord, policy: LogRetentionPolicy, now: Date): LogResourceView {
    const days = resource.resourceType === 'daily-aggregate'
      ? policy.aggregateRetentionDays
      : policy.detailRetentionDays;
    const expiresAt = new Date(resource.resourceCreatedAt.getTime() + days * DAY_MS);
    return { ...resource, expiresAt: expiresAt.toISOString(), expired: expiresAt <= now };
  }
}

function spoolResourceId(eventId: string): string {
  return `spool-${createHash('sha256').update(eventId).digest('hex').slice(0, 24)}`;
}
