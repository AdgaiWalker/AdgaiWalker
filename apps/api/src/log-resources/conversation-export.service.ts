import { HttpStatus, Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type {
  ConversationExportFilters,
  ConversationExportFormat,
  ConversationExportJobView,
  ConversationLogDetail,
} from '@walker/shared';
import { redactSensitive } from '@walker/shared';
import { ApiError } from '../common/http-error';
import { newId } from '../common/ids';
import {
  CONVERSATION_EXPORT_FILE_STORE,
  type ConversationExportFile,
  type ConversationExportFileStorePort,
} from '../ports/conversation-export-file-store.port';
import {
  CONVERSATION_EXPORT_REPOSITORY,
  type ConversationExportRecord,
  type ConversationExportRepositoryPort,
} from '../ports/conversation-export.repository';
import { CONVERSATION_QUERY_REPOSITORY, type ConversationQueryRepositoryPort } from '../ports/conversation-query.repository';
import type { ConversationExportRevokerPort } from '../ports/conversation-export-revoker.port';
import { encodeConversationCsvRow, redactExportValue } from './conversation-export.format';
import { CONVERSATION_EXPORT_MAX_ROWS, conversationExportExpiresAt } from './conversation-export.policy';
import { ConversationQueryService, type ConversationQueryInput } from './conversation-query.service';

const MAINTENANCE_INTERVAL_MS = 30_000;
const CSV_SUMMARY_FIELDS = [
  'conversationId', 'contentSlug', 'placementKey', 'createdAt', 'lastActivityAt', 'turnCount',
  'latestQuestion', 'latestDelivery', 'latestRunState', 'participants',
];
const CSV_FIELDS = ['recordType', 'snapshotAt', 'retentionCutoff', 'rowCount', 'filters', ...CSV_SUMMARY_FIELDS];
const JSON_FIELDS = ['conversation metadata', 'turns', 'messages', 'citations', 'attempts', 'runs', 'interactions'];
const FILTER_KEYS = ['from', 'to', 'contentSlug', 'placementKey', 'agentId', 'runState', 'keyword'] as const;

type ExportRequest = { format: ConversationExportFormat; filters: ConversationQueryInput };

@Injectable()
export class ConversationExportService implements OnModuleInit, OnModuleDestroy, ConversationExportRevokerPort {
  private readonly queued = new Set<string>();
  private readonly queue: string[] = [];
  private draining = false;
  private maintenanceTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(ConversationQueryService) private readonly conversations: ConversationQueryService,
    @Inject(CONVERSATION_QUERY_REPOSITORY) private readonly queryRepository: ConversationQueryRepositoryPort,
    @Inject(CONVERSATION_EXPORT_REPOSITORY) private readonly exports: ConversationExportRepositoryPort,
    @Inject(CONVERSATION_EXPORT_FILE_STORE) private readonly files: ConversationExportFileStorePort,
  ) {}

  onModuleInit(): void {
    this.maintenanceTimer = setInterval(() => { void this.maintain().catch(() => undefined); }, MAINTENANCE_INTERVAL_MS);
    this.maintenanceTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
  }

  async create(input: unknown, now = new Date()): Promise<ConversationExportJobView> {
    const request = parseExportRequest(input);
    const filter = await this.conversations.snapshotFilter(request.filters, now);
    const ids = await this.queryRepository.snapshotIds(filter, CONVERSATION_EXPORT_MAX_ROWS + 1);
    if (ids.length > CONVERSATION_EXPORT_MAX_ROWS) {
      throw new ApiError('conversation-export-limit-exceeded', HttpStatus.UNPROCESSABLE_ENTITY, '当前筛选超过 10,000 个会话，请缩小日期或筛选范围');
    }

    const job = await this.exports.create({
      id: newId(),
      format: request.format,
      filters: normalizedFilters(filter),
      snapshotAt: now,
      retentionCutoff: filter.retentionCutoff,
      conversationIds: ids,
    });
    this.schedule(job.id);
    return this.view(job);
  }

  async status(id: string, now = new Date()): Promise<ConversationExportJobView> {
    const job = await this.find(id);
    if (conversationExportExpiresAt(job.snapshotAt) <= now && job.status !== 'REVOKED' && job.status !== 'EXPIRED') {
      await this.expireAndRemove(job.id, now);
      return this.view((await this.find(id)));
    }
    return this.view(job);
  }

  async download(id: string, now = new Date()): Promise<{ job: ConversationExportRecord; file: ConversationExportFile }> {
    assertExportId(id);
    const state = await this.exports.recordDownload(id, now);
    if (state === 'MISSING') throw exportNotFound();
    if (state === 'EXPIRED') {
      await this.expireAndRemove(id, now);
      throw exportGone('conversation-export-expired', '导出文件已过期，请重新创建导出');
    }
    if (state === 'REVOKED') {
      await this.revokeAndRemove(id);
      throw exportGone('conversation-export-revoked', '导出包含已删除会话，文件已失效');
    }
    if (state !== 'READY') {
      throw new ApiError('conversation-export-not-ready', HttpStatus.CONFLICT, state === 'FAILED' ? '导出生成失败' : '导出仍在生成');
    }

    const job = await this.find(id);
    try {
      return { job, file: await this.files.open(job.id, job.format) };
    } catch {
      await this.exports.fail(id, 'conversation-export-file-unavailable').catch(() => undefined);
      throw exportGone('conversation-export-file-unavailable', '导出文件当前不可用，请重新创建导出');
    }
  }

  async prepareForStartup(now = new Date()): Promise<void> {
    await this.files.cleanupTemporary();
    await this.cleanupExpired(now);
    await this.exports.requeueInterrupted();
    await this.files.reconcile(await this.exports.readyArtifacts(now));
  }

  async cleanupExpired(now = new Date()): Promise<void> {
    for (let pass = 0; pass < 100; pass += 1) {
      const ids = await this.exports.expiredIds(now, 100);
      if (ids.length === 0) return;
      for (const id of ids) await this.expireAndRemove(id, now);
    }
    throw new Error('conversation-export-expiry-pass-limit');
  }

  async revokeAndRemove(id: string): Promise<void> {
    assertExportId(id);
    await this.files.remove(id);
    await this.exports.revoke(id, 'conversation-deleted');
  }

  private async maintain(): Promise<void> {
    await this.cleanupExpired();
    await this.resumePending();
  }

  async resumePending(): Promise<void> {
    const ids = await this.exports.pendingIds(new Date(), 10);
    for (const id of ids) this.schedule(id);
  }

  private schedule(id: string): void {
    if (this.queued.has(id)) return;
    this.queued.add(id);
    this.queue.push(id);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const id = this.queue.shift()!;
        this.queued.delete(id);
        await this.generate(id);
      }
    } finally {
      this.draining = false;
      if (this.queue.length > 0) void this.drain();
    }
  }

  private async generate(id: string): Promise<void> {
    const job = await this.exports.claim(id).catch(() => null);
    if (!job) return;
    try {
      const ids = await this.exports.snapshotConversationIds(id);
      if (ids.length !== job.rowCount) throw new Error('conversation-export-snapshot-incomplete');
      await this.files.write(id, job.format, this.artifactChunks(job, ids));
      const ready = await this.exports.complete(id, new Date());
      if (!ready) await this.removeTerminalArtifact(job.id, new Date());
    } catch {
      await this.removeTerminalArtifact(job.id, new Date()).catch(() => undefined);
      await this.exports.fail(id, 'conversation-export-generation-failed').catch(() => undefined);
    }
  }

  private async removeTerminalArtifact(id: string, now: Date): Promise<void> {
    await this.files.remove(id);
    const job = await this.exports.find(id);
    if (!job) return;
    if (conversationExportExpiresAt(job.snapshotAt) <= now && job.status !== 'EXPIRED') await this.exports.expire(id, now);
    else if (job.status === 'REVOKED') await this.exports.revoke(id, 'conversation-deleted');
  }

  private async expireAndRemove(id: string, now: Date): Promise<void> {
    await this.files.remove(id);
    await this.exports.expire(id, now);
  }

  private async *artifactChunks(job: ConversationExportRecord, ids: string[]): AsyncGenerator<string> {
    if (job.format === 'csv') {
      yield encodeConversationCsvRow(CSV_FIELDS);
      yield encodeConversationCsvRow([
        'metadata', job.snapshotAt.toISOString(), job.retentionCutoff.toISOString(), job.rowCount,
        JSON.stringify(redactExportValue(job.filters)), ...CSV_SUMMARY_FIELDS.map(() => null),
      ]);
      for (const id of ids) {
        const detail = await this.snapshotDetail(id, job);
        yield encodeConversationCsvRow([
          'conversation', job.snapshotAt.toISOString(), job.retentionCutoff.toISOString(), job.rowCount, '',
          ...csvSummary(detail),
        ]);
      }
      return;
    }

    const metadata = redactExportValue({
      format: 'json', snapshotAt: job.snapshotAt.toISOString(), retentionCutoff: job.retentionCutoff.toISOString(),
      filters: job.filters, rowCount: ids.length, fields: JSON_FIELDS,
    });
    yield `{"metadata":${JSON.stringify(metadata)},"items":[`;
    for (const [index, id] of ids.entries()) {
      const detail = await this.snapshotDetail(id, job);
      yield `${index === 0 ? '' : ','}${JSON.stringify(redactExportValue(detail))}`;
    }
    yield ']}';
  }

  private async snapshotDetail(id: string, job: ConversationExportRecord): Promise<ConversationLogDetail> {
    const detail = await this.queryRepository.detail(id, job.retentionCutoff, job.snapshotAt);
    if (!detail) throw new Error('conversation-export-snapshot-unavailable');
    return detail;
  }

  private async find(id: string): Promise<ConversationExportRecord> {
    assertExportId(id);
    const job = await this.exports.find(id);
    if (!job) throw exportNotFound();
    return job;
  }

  private view(job: ConversationExportRecord): ConversationExportJobView {
    return {
      id: job.id,
      format: job.format,
      state: job.status,
      filters: job.filters,
      snapshotAt: job.snapshotAt.toISOString(),
      retentionCutoff: job.retentionCutoff.toISOString(),
      expiresAt: conversationExportExpiresAt(job.snapshotAt).toISOString(),
      rowCount: job.rowCount,
      errorCode: job.errorCode,
      downloadPath: job.status === 'READY' ? `/ops/exports/${encodeURIComponent(job.id)}/download` : null,
      fields: job.format === 'csv' ? CSV_FIELDS : JSON_FIELDS,
    };
  }
}

function parseExportRequest(value: unknown): ExportRequest {
  if (!isRecord(value) || (value.format !== 'csv' && value.format !== 'json')) {
    throw new ApiError('conversation-export-invalid', HttpStatus.BAD_REQUEST, '导出格式或筛选条件无效');
  }
  if (Object.keys(value).some((key) => key !== 'format' && key !== 'filters')) {
    throw new ApiError('conversation-export-invalid', HttpStatus.BAD_REQUEST, '导出请求包含不支持的字段');
  }
  const rawFilters = value.filters === undefined ? {} : value.filters;
  if (!isRecord(rawFilters)) throw new ApiError('conversation-export-invalid', HttpStatus.BAD_REQUEST, '导出筛选条件无效');
  if (Object.keys(rawFilters).some((key) => !FILTER_KEYS.includes(key as (typeof FILTER_KEYS)[number]))) {
    throw new ApiError('conversation-export-invalid', HttpStatus.BAD_REQUEST, '导出请求包含不支持的筛选项');
  }
  const filters: ConversationQueryInput = {};
  for (const key of FILTER_KEYS) {
    const item = rawFilters[key];
    if (item === undefined || item === null) continue;
    if (typeof item !== 'string') throw new ApiError('conversation-export-invalid', HttpStatus.BAD_REQUEST, '导出筛选条件无效');
    filters[key] = item;
  }
  return { format: value.format, filters };
}

function normalizedFilters(filter: Awaited<ReturnType<ConversationQueryService['snapshotFilter']>>): ConversationExportFilters {
  const date = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
  const inclusiveEnd = filter.toExclusive ? new Date(filter.toExclusive.getTime() - 24 * 60 * 60 * 1_000) : null;
  return {
    from: date(filter.from),
    to: date(inclusiveEnd),
    contentSlug: cleanFilter(filter.contentSlug),
    placementKey: cleanFilter(filter.placementKey),
    agentId: cleanFilter(filter.agentId),
    runState: cleanFilter(filter.runState),
    keyword: cleanFilter(filter.keyword),
  };
}

function cleanFilter(value: string | null): string | null {
  return value ? redactSensitive(value) : null;
}

function csvSummary(detail: ConversationLogDetail): unknown[] {
  const messages = detail.turns.flatMap((turn) => turn.messages);
  const latestQuestion = [...messages].reverse().find((message) => message.role === 'visitor');
  const latestAnswer = [...messages].reverse().find((message) => message.role === 'assistant');
  const latestRun = detail.turns.flatMap((turn) => turn.attempts).reverse().find((attempt) => attempt.run)?.run;
  const participants = new Map<string, string>();
  for (const attempt of detail.turns.flatMap((turn) => turn.attempts)) {
    if (attempt.agent) participants.set(`${attempt.agent.agentId}:${attempt.agent.revision}`, `${attempt.agent.agentName} · v${attempt.agent.revision}`);
  }
  return [
    detail.conversationId, detail.contentSlug, detail.placementKey, detail.createdAt, detail.lastActivityAt,
    detail.turns.length, latestQuestion?.body ?? null, latestAnswer?.delivery ?? null, latestRun?.state ?? null,
    [...participants.values()].join('、') || null,
  ];
}

function assertExportId(id: string): void {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw exportNotFound();
}

function exportNotFound(): ApiError {
  return new ApiError('conversation-export-not-found', HttpStatus.NOT_FOUND, '找不到这个导出任务');
}

function exportGone(code: string, message: string): ApiError {
  return new ApiError(code, HttpStatus.GONE, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
