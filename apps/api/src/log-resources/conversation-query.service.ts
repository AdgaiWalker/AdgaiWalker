import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../common/http-error';
import { CONVERSATION_QUERY_REPOSITORY, type ConversationQueryFilter, type ConversationQueryRepositoryPort } from '../ports/conversation-query.repository';
import { LogResourceService } from './log-resource.service';

const RUN_STATES = new Set(['QUEUED', 'CLAIMED', 'RUNNING', 'STOPPING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN', 'NONE']);
const MAX_CURSOR_LENGTH = 512;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type ConversationQueryInput = {
  cursor?: string;
  limit?: string;
  from?: string;
  to?: string;
  contentSlug?: string;
  placementKey?: string;
  agentId?: string;
  runState?: string;
  keyword?: string;
};

@Injectable()
export class ConversationQueryService {
  constructor(
    @Inject(CONVERSATION_QUERY_REPOSITORY) private readonly repository: ConversationQueryRepositoryPort,
    @Inject(LogResourceService) private readonly resources: LogResourceService,
  ) {}

  async list(raw: ConversationQueryInput, now = new Date()) {
    const [filters, policy] = await Promise.all([parseQuery(raw), this.resources.getPolicy()]);
    filters.retentionCutoff = new Date(now.getTime() - policy.detailRetentionDays * DAY_MS);
    return this.repository.list(filters);
  }

  async snapshotFilter(raw: ConversationQueryInput, now = new Date()): Promise<ConversationQueryFilter> {
    const [filters, policy] = await Promise.all([parseQuery(raw), this.resources.getPolicy()]);
    return {
      ...filters,
      cursor: null,
      snapshotAt: now,
      retentionCutoff: new Date(now.getTime() - policy.detailRetentionDays * DAY_MS),
    };
  }

  async detail(conversationId: string, now = new Date()) {
    const id = conversationId.trim();
    if (!id || id.length > 200) throw conversationNotFound();
    const policy = await this.resources.getPolicy();
    const retentionCutoff = new Date(now.getTime() - policy.detailRetentionDays * DAY_MS);
    const result = await this.repository.detail(id, retentionCutoff);
    if (!result) throw conversationNotFound();
    return result;
  }
}

function parseQuery(raw: ConversationQueryInput): ConversationQueryFilter {
  const limit = raw.limit === undefined || raw.limit === '50' ? 50 : raw.limit === '100' ? 100 : null;
  const from = parseDate(raw.from, false);
  const toExclusive = parseDate(raw.to, true);
  const contentSlug = optionalText(raw.contentSlug, 128);
  const placementKey = optionalText(raw.placementKey, 128);
  const agentId = optionalText(raw.agentId, 128);
  const keyword = optionalText(raw.keyword, 200);
  const runState = optionalText(raw.runState, 20);
  const cursor = parseCursor(raw.cursor);

  if (limit === null || from === INVALID || toExclusive === INVALID || contentSlug === INVALID ||
      placementKey === INVALID || agentId === INVALID || keyword === INVALID || runState === INVALID ||
      cursor === INVALID ||
      (runState && !RUN_STATES.has(runState)) || (from && toExclusive && from >= toExclusive)) {
    throw new ApiError('conversation-query-invalid', HttpStatus.BAD_REQUEST, '会话筛选条件无效');
  }

  return { limit, cursor, from, toExclusive, contentSlug, placementKey, agentId, runState, keyword, retentionCutoff: new Date(0) };
}

const INVALID = Symbol('invalid-query-value');
type ParsedText = string | null | typeof INVALID;

function optionalText(value: string | undefined, maximum: number): ParsedText {
  if (value === undefined || value.trim() === '') return null;
  const normalized = value.trim();
  if (normalized.length > maximum || /[\u0000-\u001f\u007f]/.test(normalized)) return INVALID;
  return normalized;
}

function parseDate(value: string | undefined, exclusiveEnd: boolean): Date | null | typeof INVALID {
  if (value === undefined || value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return INVALID;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return INVALID;
  if (exclusiveEnd) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function parseCursor(value: string | undefined): { updatedAt: Date; id: string } | null | typeof INVALID {
  if (value === undefined || value === '') return null;
  if (value.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) return INVALID;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { updatedAt?: unknown; id?: unknown };
    if (typeof parsed.updatedAt !== 'string' || typeof parsed.id !== 'string' || !parsed.id || parsed.id.length > 200) return INVALID;
    const updatedAt = new Date(parsed.updatedAt);
    if (!Number.isFinite(updatedAt.getTime()) || updatedAt.toISOString() !== parsed.updatedAt) return INVALID;
    return { updatedAt, id: parsed.id };
  } catch {
    return INVALID;
  }
}

function conversationNotFound(): ApiError {
  return new ApiError('conversation-not-found', HttpStatus.NOT_FOUND, '找不到这个会话');
}
