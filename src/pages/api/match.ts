/**
 * POST /api/match — 用户需求匹配入口
 *
 * 四层架构重构后的 HTTP 薄层：
 * API route 只负责 HTTP 协议（解析请求、速率限制、格式化响应），
 * 业务编排委托给 AgentOrchestrator.handleNeed()。
 *
 * 认证状态由 UserContextService 解析：admin cookie(role=admin) → admin；
 * 账号会话 cookie → user；否则 public（401）。
 */

import { createHash } from 'node:crypto';

import type { APIRoute } from 'astro';
import { Redis } from '@upstash/redis';

import { createAgentOrchestrator } from '@/services/agent-orchestrator.service';
import { createSafetyService } from '@/services/safety.service';
import { createUserContextService } from '@/services/user-context.service';
import { isAdmin } from '@/lib/admin-auth';
import { readSessionId } from '@/lib/account-auth';
import { createAccountStore } from '@/stores/account.store';
import { createIncidentStore } from '@/stores/incident.store';
import { createMatchSessionStore } from '@/stores/match-session.store';
import { createNeedCaseStore } from '@/stores/need-case.store';
import { createSessionStore } from '@/stores/session.store';
import { createUserProfileStore } from '@/stores/user-profile.store';
import { audienceGroupLabels, aiStageLabels } from '@/profiles/resource-index';

const userContextService = createUserContextService({
  sessionStore: createSessionStore(),
  accountStore: createAccountStore(),
  profileStore: createUserProfileStore(),
});

const agentOrchestrator = createAgentOrchestrator({
  sessionStore: createMatchSessionStore(),
  needCaseStore: createNeedCaseStore(),
  safetyService: createSafetyService({ incidentStore: createIncidentStore() }),
});

const DAILY_LIMIT = Number(import.meta.env.MATCH_DAILY_LIMIT ?? 20);
const MINUTE_LIMIT = Number(import.meta.env.MATCH_MINUTE_LIMIT ?? 5);
const FALLBACK_DAILY_LIMIT = 5;
const MAX_BODY_BYTES = 8_192;
const MAX_MESSAGES = 16;
const MAX_MESSAGE_LENGTH = 500;
const MAX_TOTAL_CHARS = 4_800;
const MAX_SOURCE_PAGE_LENGTH = 120;
const GLOBAL_DAILY_LIMIT = Number(import.meta.env.MATCH_GLOBAL_DAILY_LIMIT ?? 1_000);
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const memoryLimiter = new Map<string, { dailyCount: number; minuteCount: number; dayResetAt: number; minuteResetAt: number }>();
const memoryGlobalLimiter = { dailyCount: 0, dayResetAt: 0 };
let cachedRedis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const url = import.meta.env.UPSTASH_REDIS_REST_URL ?? import.meta.env.KV_REST_API_URL;
  const token = import.meta.env.UPSTASH_REDIS_REST_TOKEN ?? import.meta.env.KV_REST_API_TOKEN;
  if (!url || !token) { cachedRedis = null; return cachedRedis; }
  try { cachedRedis = new Redis({ url, token }); } catch { cachedRedis = null; }
  return cachedRedis;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function getClientIP(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip') || 'unknown';
}

function hashRateLimitSubject(subject: string): string {
  const salt = import.meta.env.MATCH_RATE_LIMIT_SALT ?? import.meta.env.CRON_SECRET ?? 'match-rate-limit';
  return createHash('sha256').update(salt + ':' + subject).digest('hex').slice(0, 32);
}

interface ChatMessage { role: 'user' | 'assistant'; content: string; }
interface MatchRequestBody {
  sessionId?: string;
  messages: ChatMessage[];
  audienceGroup?: string;
  aiStage?: string;
  consentForTopic?: boolean;
  sourcePage?: string;
}

function validateBody(body: unknown): body is MatchRequestBody {
  if (!body || typeof body !== 'object') return false;
  const data = body as Record<string, unknown>;
  if (!Array.isArray(data.messages)) return false;
  if (data.messages.length === 0 || data.messages.length > MAX_MESSAGES) return false;
  if (data.sessionId !== undefined && (typeof data.sessionId !== 'string' || !SESSION_ID_PATTERN.test(data.sessionId))) return false;
  if (data.sourcePage !== undefined && (typeof data.sourcePage !== 'string' || data.sourcePage.length > MAX_SOURCE_PAGE_LENGTH || !data.sourcePage.startsWith('/'))) return false;
  if (data.audienceGroup !== undefined && (typeof data.audienceGroup !== 'string' || !(data.audienceGroup in audienceGroupLabels))) return false;
  if (data.aiStage !== undefined && (typeof data.aiStage !== 'string' || !(data.aiStage in aiStageLabels))) return false;
  if (data.consentForTopic !== undefined && typeof data.consentForTopic !== 'boolean') return false;

  let totalLength = 0;
  for (const msg of data.messages) {
    if (!msg || typeof msg !== 'object') return false;
    const item = msg as Record<string, unknown>;
    if (item.role !== 'user' && item.role !== 'assistant') return false;
    if (typeof item.content !== 'string') return false;
    if (item.content.length > MAX_MESSAGE_LENGTH) return false;
    totalLength += item.content.length;
  }
  return totalLength <= MAX_TOTAL_CHARS;
}

async function checkRateLimit(subject: string): Promise<{ allowed: boolean; remaining: number }> {
  const now = Date.now();
  const redis = getRedis();

  if (!redis) {
    if (now > memoryGlobalLimiter.dayResetAt) {
      memoryGlobalLimiter.dailyCount = 1;
      memoryGlobalLimiter.dayResetAt = now + 86_400_000;
    } else { memoryGlobalLimiter.dailyCount += 1; }

    const entry = memoryLimiter.get(subject);
    if (!entry || now > entry.dayResetAt) {
      memoryLimiter.set(subject, { dailyCount: 1, minuteCount: 1, dayResetAt: now + 86_400_000, minuteResetAt: now + 60_000 });
      return { allowed: memoryGlobalLimiter.dailyCount <= GLOBAL_DAILY_LIMIT, remaining: Math.max(0, Math.min(FALLBACK_DAILY_LIMIT - 1, GLOBAL_DAILY_LIMIT - memoryGlobalLimiter.dailyCount)) };
    }
    const minuteCount = now > entry.minuteResetAt ? 1 : entry.minuteCount + 1;
    const next = { ...entry, dailyCount: entry.dailyCount + 1, minuteCount, minuteResetAt: now > entry.minuteResetAt ? now + 60_000 : entry.minuteResetAt };
    memoryLimiter.set(subject, next);
    return {
      allowed: next.dailyCount <= FALLBACK_DAILY_LIMIT && next.minuteCount <= MINUTE_LIMIT && memoryGlobalLimiter.dailyCount <= GLOBAL_DAILY_LIMIT,
      remaining: Math.max(0, Math.min(FALLBACK_DAILY_LIMIT - next.dailyCount, GLOBAL_DAILY_LIMIT - memoryGlobalLimiter.dailyCount)),
    };
  }

  try {
    const dailyKey = 'match:limit:day:' + subject;
    const minuteKey = 'match:limit:minute:' + subject;
    const globalKey = 'match:limit:global:day';
    const [dailyCount, minuteCount, globalCount] = await Promise.all([redis.incr(dailyKey), redis.incr(minuteKey), redis.incr(globalKey)]);
    if (dailyCount === 1) await redis.expire(dailyKey, 86_400);
    if (minuteCount === 1) await redis.expire(minuteKey, 60);
    if (globalCount === 1) await redis.expire(globalKey, 86_400);
    return {
      allowed: dailyCount <= DAILY_LIMIT && minuteCount <= MINUTE_LIMIT && globalCount <= GLOBAL_DAILY_LIMIT,
      remaining: Math.max(0, Math.min(DAILY_LIMIT - dailyCount, GLOBAL_DAILY_LIMIT - globalCount)),
    };
  } catch { return { allowed: true, remaining: 0 }; }
}

export const POST: APIRoute = async ({ request }) => {
  const rawLength = request.headers.get('content-length');
  if (rawLength && Number(rawLength) > MAX_BODY_BYTES) {
    return jsonResponse({ error: '输入太长，请缩短后再试。' }, 413);
  }

  let body: MatchRequestBody;
  try {
    const rawText = await request.text();
    if (new TextEncoder().encode(rawText).length > MAX_BODY_BYTES) {
      return jsonResponse({ error: '输入太长，请缩短后再试。' }, 413);
    }
    const raw = JSON.parse(rawText);
    if (!validateBody(raw)) throw new Error('invalid body');
    body = raw;
  } catch {
    return jsonResponse({ error: '请求格式不正确。' }, 400);
  }

  // 后端 gate：全量交互功能需登录用户或管理员，public 返回 401
  const sessionId = readSessionId(request);
  const adminFlag = isAdmin(request);
  const userContext = await userContextService.resolve({
    sessionId,
    isAdmin: adminFlag,
  });
  if (userContext.authState === 'public') {
    return jsonResponse({ error: '请先登录后再使用匹配功能。' }, 401);
  }

  const rateLimitSubject = hashRateLimitSubject(
    userContext.authState === 'user' && userContext.sessionId
      ? `user:${userContext.sessionId}`
      : `admin:${getClientIP(request)}`,
  );
  const rateLimit = await checkRateLimit(rateLimitSubject);
  if (!rateLimit.allowed) {
    return jsonResponse({ error: '匹配太频繁了，稍后再试。', remaining: rateLimit.remaining }, 429);
  }

  const result = await agentOrchestrator.handleNeed({
    userContext,
    messages: body.messages,
    audienceGroup: body.audienceGroup,
    aiStage: body.aiStage,
    consentForTopic: body.consentForTopic,
    sourcePage: body.sourcePage,
    sessionId: body.sessionId,
  });

  return jsonResponse({
    ...(result.needCaseId ? { needCaseId: result.needCaseId } : {}),
    sessionId: result.sessionId,
    remaining: rateLimit.remaining,
    ...(result.responsePayload as Record<string, unknown>),
  });
};
