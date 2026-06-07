import { createHash, randomUUID } from 'node:crypto';

import type { APIRoute } from 'astro';
import { Redis } from '@upstash/redis';

import {
  aiStageLabels,
  audienceGroupLabels,
  matchResources,
  needCategoryLabels,
  type AiStage,
  type AudienceGroup,
  type FitVerdict,
  type MatchResource,
  type NeedCategory,
} from '@/profiles/resource-index';
import { compactText, isMinorAudience, redactSensitiveText } from '@/agent/privacy';
import { callGateway } from '@/agent/gateway';
import { matchSiteResources } from '@/agent/match';
import {
  createSessionId,
  getMatchSession,
  incrementMatchStats,
  saveDemandEvent,
  upsertMatchSession,
  saveConversationMessages,
  type ConversationMessage,
  type DemandEvent,
  type MatchSession,
} from '@/conversation/store';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface MatchRequestBody {
  sessionId?: string;
  messages: ChatMessage[];
  audienceGroup?: AudienceGroup;
  aiStage?: AiStage;
  consentForTopic?: boolean;
  sourcePage?: string;
}

interface ModelChoice {
  bridge?: string;
  resourceIds?: string[];
  needSummary?: string;
  categories?: NeedCategory[];
  fitVerdict?: FitVerdict;
  toolDirection?: string;
  reason?: string;
  inferredAudience?: AudienceGroup;
  inferredAiStage?: AiStage;
}

const PROMPT_VERSION = 'tool-match-v2';
const MODEL_VERSION = 'claude-sonnet-4-6';
const DAILY_LIMIT = Number(import.meta.env.MATCH_DAILY_LIMIT ?? 20);
const MINUTE_LIMIT = Number(import.meta.env.MATCH_MINUTE_LIMIT ?? 5);
const FALLBACK_DAILY_LIMIT = 5;
const MAX_BODY_BYTES = 8_192;
const MAX_MESSAGES = 8;
const MAX_MESSAGE_LENGTH = 500;
const MAX_TOTAL_CHARS = 2_400;
const MAX_SOURCE_PAGE_LENGTH = 120;
const MAX_MODEL_TOKENS = 700;
const MODEL_TIMEOUT_MS = 10_000;
const GLOBAL_DAILY_LIMIT = Number(import.meta.env.MATCH_GLOBAL_DAILY_LIMIT ?? 1_000);
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const memoryLimiter = new Map<string, { dailyCount: number; minuteCount: number; dayResetAt: number; minuteResetAt: number }>();
const memoryGlobalLimiter = { dailyCount: 0, dayResetAt: 0 };
let cachedRedis: Redis | null | undefined;

const FIT_VERDICTS: FitVerdict[] = ['codex-fit', 'codex-not-needed', 'codex-maybe', 'not-enough-info'];

const SYSTEM_PROMPT = `你是 iwalk.pro 的需求匹配助手。

核心任务：
用户来描述一个需求，你帮他们判断该用什么工具，并从站内资料中推荐最有帮助的 2-4 条。

硬性规则：
1. 不外部搜索。只使用站内资料索引。
2. 不编造工具。只推荐索引中存在的资料。
3. 不重写文章。
4. 不输出未在索引里的资料。
5. 不收集身份信息，只处理需求。
6. 只返回 JSON，不要返回 Markdown。
7. resourceIds 只能使用站内资料索引里的 ID。
8. 优先判断需求类型，再推荐资料。
9. 如果用户信息不够，返回 not-enough-info 并在 reason 中说明需要补充什么。

返回 JSON 格式：
{
  “fitVerdict”: “codex-fit”,
  “toolDirection”: “推荐工具方向和理由”,
  “reason”: “为什么这样判断”,
  “bridge”: “一句话串联语”,
  “needSummary”: “一句话需求摘要”,
  “categories”: [“coding”],
  “resourceIds”: [“learn-ai-life”, “tools-ai-tools”]
}

fitVerdict 判断标准：
- codex-fit：涉及代码、仓库、报错、重构、脚本执行、部署、API 对接等，适合代码 Agent。
- codex-not-needed：写作、总结、翻译、解释、学习、内容整理、表格/PPT/报名表、数据分析等，用聊天 AI 或办公工具更合适。
- codex-maybe：要做网站/应用/项目，但不确定是否已有代码，需要更多信息。
- not-enough-info：信息太少，需要用户补充”场景 + 目标 + 卡点”。

站内资料索引：
${matchResources.map(resource => [
  `ID: ${resource.id}`,
  `标题: ${resource.title}`,
  `用途: ${resource.useFor}`,
  `分类: ${resource.categories.map(category => needCategoryLabels[category]).join('、')}`,
  `工具适配: ${resource.toolFit?.join('、') ?? '未标注'}`,
  `关键词: ${resource.keywords.join('、')}`,
].join('\n')).join('\n\n')}`;

function getRedis(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const url = import.meta.env.UPSTASH_REDIS_REST_URL ?? import.meta.env.KV_REST_API_URL;
  const token = import.meta.env.UPSTASH_REDIS_REST_TOKEN ?? import.meta.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    cachedRedis = null;
    return cachedRedis;
  }
  try {
    cachedRedis = new Redis({ url, token });
  } catch {
    cachedRedis = null;
  }
  return cachedRedis;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function getClientIP(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function hashRateLimitSubject(ip: string): string {
  const salt = import.meta.env.MATCH_RATE_LIMIT_SALT ?? import.meta.env.CRON_SECRET ?? 'match-rate-limit';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

function getBodyByteLength(request: Request): number {
  const raw = request.headers.get('content-length');
  return raw ? Number(raw) : 0;
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
  for (const message of data.messages) {
    if (!message || typeof message !== 'object') return false;
    const item = message as Record<string, unknown>;
    if (item.role !== 'user' && item.role !== 'assistant') return false;
    if (typeof item.content !== 'string') return false;
    if (item.content.length > MAX_MESSAGE_LENGTH) return false;
    totalLength += item.content.length;
  }

  return totalLength <= MAX_TOTAL_CHARS;
}

function cleanMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .slice(-MAX_MESSAGES)
    .map(message => ({
      role: message.role,
      content: redactSensitiveText(compactText(message.content, MAX_MESSAGE_LENGTH)).text,
    }));
}

function getLatestUserNeed(messages: ChatMessage[]): string {
  return [...messages].reverse().find(message => message.role === 'user')?.content ?? '';
}

async function checkRateLimit(subject: string): Promise<{ allowed: boolean; remaining: number }> {
  const now = Date.now();
  const redis = getRedis();

  if (!redis) {
    if (now > memoryGlobalLimiter.dayResetAt) {
      memoryGlobalLimiter.dailyCount = 1;
      memoryGlobalLimiter.dayResetAt = now + 86_400_000;
    } else {
      memoryGlobalLimiter.dailyCount += 1;
    }

    const entry = memoryLimiter.get(subject);
    if (!entry || now > entry.dayResetAt) {
      memoryLimiter.set(subject, {
        dailyCount: 1,
        minuteCount: 1,
        dayResetAt: now + 86_400_000,
        minuteResetAt: now + 60_000,
      });
      return {
        allowed: memoryGlobalLimiter.dailyCount <= GLOBAL_DAILY_LIMIT,
        remaining: Math.max(0, Math.min(FALLBACK_DAILY_LIMIT - 1, GLOBAL_DAILY_LIMIT - memoryGlobalLimiter.dailyCount)),
      };
    }
    const minuteCount = now > entry.minuteResetAt ? 1 : entry.minuteCount + 1;
    const next = {
      ...entry,
      dailyCount: entry.dailyCount + 1,
      minuteCount,
      minuteResetAt: now > entry.minuteResetAt ? now + 60_000 : entry.minuteResetAt,
    };
    memoryLimiter.set(subject, next);
    return {
      allowed: next.dailyCount <= FALLBACK_DAILY_LIMIT
        && next.minuteCount <= MINUTE_LIMIT
        && memoryGlobalLimiter.dailyCount <= GLOBAL_DAILY_LIMIT,
      remaining: Math.max(0, Math.min(FALLBACK_DAILY_LIMIT - next.dailyCount, GLOBAL_DAILY_LIMIT - memoryGlobalLimiter.dailyCount)),
    };
  }

  try {
    const dailyKey = `match:limit:day:${subject}`;
    const minuteKey = `match:limit:minute:${subject}`;
    const globalKey = 'match:limit:global:day';
    const [dailyCount, minuteCount, globalCount] = await Promise.all([
      redis.incr(dailyKey),
      redis.incr(minuteKey),
      redis.incr(globalKey),
    ]);
    if (dailyCount === 1) await redis.expire(dailyKey, 86_400);
    if (minuteCount === 1) await redis.expire(minuteKey, 60);
    if (globalCount === 1) await redis.expire(globalKey, 86_400);

    return {
      allowed: dailyCount <= DAILY_LIMIT && minuteCount <= MINUTE_LIMIT && globalCount <= GLOBAL_DAILY_LIMIT,
      remaining: Math.max(0, Math.min(DAILY_LIMIT - dailyCount, GLOBAL_DAILY_LIMIT - globalCount)),
    };
  } catch {
    return { allowed: true, remaining: 0 };
  }
}

function pickResources(ids: string[] | undefined, fallback: MatchResource[]): MatchResource[] {
  if (!ids?.length) return fallback;
  const picked = ids
    .map(id => matchResources.find(resource => resource.id === id))
    .filter((resource): resource is MatchResource => Boolean(resource));
  return picked.length > 0 ? picked.slice(0, 4) : fallback;
}

function pickFitVerdict(value: unknown, fallback: FitVerdict): FitVerdict {
  return typeof value === 'string' && FIT_VERDICTS.includes(value as FitVerdict)
    ? value as FitVerdict
    : fallback;
}

function pickCategories(value: unknown, fallback: NeedCategory[]): NeedCategory[] {
  if (!Array.isArray(value)) return fallback;
  const picked = value
    .filter((category): category is NeedCategory => typeof category === 'string' && category in needCategoryLabels)
    .slice(0, 3);
  return picked.length > 0 ? picked : fallback;
}

function parseModelJson(text: string): ModelChoice | null {
  try {
    const jsonText = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(jsonText) as ModelChoice;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// 替换后的 askModel 函数
async function askModel(input: {
  messages: ChatMessage[];
  localBridge: string;
  localResourceIds: string[];
  audienceGroup?: AudienceGroup;
  aiStage?: AiStage;
}): Promise<ModelChoice | null> {
  const userPrompt = [
    `用户人群：${input.audienceGroup ? audienceGroupLabels[input.audienceGroup] : '未说明'}`,
    `AI 阶段：${input.aiStage ? aiStageLabels[input.aiStage] : '未说明'}`,
    `本地初筛资料 ID：${input.localResourceIds.join('、')}`,
    `本地串联语：${input.localBridge}`,
    '用户对话：',
    input.messages.map(message => `${message.role}: ${message.content}`).join('\n'),
  ].join('\n');

  const result = await callGateway<ModelChoice | null>(
    {
      route: 'match.askModel',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      model: MODEL_VERSION,
      maxTokens: MAX_MODEL_TOKENS,
      timeoutMs: MODEL_TIMEOUT_MS,
    },
    null,
    (text) => parseModelJson(text),
  );

  return result.data;
}

function summarizeNeed(text: string): string {
  return compactText(text, 80) || '用户想找到合适的 AI 工具和站内资料';
}

async function buildSession(body: MatchRequestBody, isMinorContext: boolean): Promise<MatchSession> {
  const now = new Date().toISOString();
  const sessionId = body.sessionId || createSessionId();
  const existing = body.sessionId ? await getMatchSession(body.sessionId) : null;
  const messageCount = body.messages.filter(message => message.role === 'user').length;

  return {
    sessionId,
    startedAt: existing?.startedAt ?? now,
    lastActiveAt: now,
    sourcePage: existing?.sourcePage ?? body.sourcePage ?? '/tools',
    messageCount: (existing?.messageCount ?? 0) + messageCount,
    consentForTopic: body.consentForTopic !== false,
    audienceGroup: body.audienceGroup ?? existing?.audienceGroup,
    aiStage: body.aiStage ?? existing?.aiStage,
    isMinorContext: isMinorContext || Boolean(existing?.isMinorContext),
    promptVersion: PROMPT_VERSION,
    modelVersion: MODEL_VERSION,
  };
}

function buildDemandEvent(input: {
  session: MatchSession;
  redactedNeed: string;
  needSummary: string;
  categories: NeedCategory[];
  resourceIds: string[];
  piiDetected: boolean;
  fitVerdict: FitVerdict;
  toolDirection: string;
  codexMisuseLikely: boolean;
}): DemandEvent {
  return {
    eventId: randomUUID(),
    sessionId: input.session.sessionId,
    createdAt: new Date().toISOString(),
    rawNeedRedacted: input.session.isMinorContext ? '[青少年/未成年场景不保存原始问题]' : input.redactedNeed,
    needSummary: input.needSummary,
    needCategories: input.categories,
    fitVerdict: input.fitVerdict,
    toolDirection: input.toolDirection,
    codexMisuseLikely: input.codexMisuseLikely,
    audienceGroup: input.session.audienceGroup,
    aiStage: input.session.aiStage,
    isMinorContext: input.session.isMinorContext,
    recommendedContentIds: input.resourceIds,
    piiDetected: input.piiDetected,
    piiRemoved: input.piiDetected,
    status: input.session.consentForTopic ? 'pending' : 'ignored',
  };
}

export const POST: APIRoute = async ({ request }) => {
  if (getBodyByteLength(request) > MAX_BODY_BYTES) {
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

  const rateLimitSubject = hashRateLimitSubject(getClientIP(request));
  const rateLimit = await checkRateLimit(rateLimitSubject);
  if (!rateLimit.allowed) {
    return jsonResponse({ error: '匹配太频繁了，稍后再试。', remaining: rateLimit.remaining }, 429);
  }

  const isMinorContext = isMinorAudience(body.audienceGroup);
  const clean = cleanMessages(body.messages);
  const latestNeed = getLatestUserNeed(body.messages);
  const redacted = redactSensitiveText(compactText(latestNeed, MAX_MESSAGE_LENGTH));
  const localMatch = matchSiteResources({
    need: redacted.text,
    audienceGroup: body.audienceGroup,
    aiStage: body.aiStage,
  });

  const modelChoice = await askModel({
    messages: clean,
    localBridge: localMatch.bridge,
    localResourceIds: localMatch.resources.map(resource => resource.id),
    audienceGroup: body.audienceGroup,
    aiStage: body.aiStage,
  });

  const resources = pickResources(modelChoice?.resourceIds, localMatch.resources);
  const categories = pickCategories(modelChoice?.categories, localMatch.categories);
  const fitVerdict = pickFitVerdict(modelChoice?.fitVerdict, localMatch.fitVerdict);
  const toolDirection = compactText(modelChoice?.toolDirection || localMatch.toolDirection, 140);
  const reason = compactText(modelChoice?.reason || localMatch.reason, 140);
  const bridge = compactText(modelChoice?.bridge || localMatch.bridge, 180);
  const needSummary = compactText(modelChoice?.needSummary || summarizeNeed(redacted.text), 100);
  const session = await buildSession(body, isMinorContext);

  await upsertMatchSession(session);

  // 公开统计计数（不阻塞响应）
  incrementMatchStats(categories).catch(() => {});

  // 对话消息持久化（脱敏后）
  const now = new Date().toISOString();
  const conversationMsgs: ConversationMessage[] = clean.map(m => ({
    role: m.role,
    content: m.content,
    timestamp: now,
  }));
  conversationMsgs.push({ role: 'assistant', content: bridge || needSummary, timestamp: now });
  saveConversationMessages(session.sessionId, conversationMsgs).catch(() => {});

  // 用推断画像填充（用户未手动选时）
  if (!session.audienceGroup && modelChoice?.inferredAudience) {
    session.audienceGroup = modelChoice.inferredAudience;
  }
  if (!session.aiStage && modelChoice?.inferredAiStage) {
    session.aiStage = modelChoice.inferredAiStage;
  }

  if (session.consentForTopic) {
    await saveDemandEvent(buildDemandEvent({
      session,
      redactedNeed: redacted.text,
      needSummary,
      categories,
      resourceIds: resources.map(resource => resource.id),
      piiDetected: redacted.piiDetected,
      fitVerdict,
      toolDirection,
      codexMisuseLikely: localMatch.codexMisuseLikely,
    }));
  }

  return jsonResponse({
    sessionId: session.sessionId,
    remaining: rateLimit.remaining,
    fitVerdict,
    toolDirection,
    reason,
    bridge,
    needSummary,
    categories: categories.map(category => ({
      id: category,
      label: needCategoryLabels[category],
    })),
    resources: resources.map(resource => ({
      id: resource.id,
      title: resource.title,
      href: resource.href,
      kind: resource.kind,
      useFor: resource.useFor,
      summary: resource.summary,
    })),
    safety: {
      piiDetected: redacted.piiDetected,
      consentForTopic: session.consentForTopic,
      isMinorContext,
      note: '请不要输入姓名、联系方式、API Key、公司机密等敏感信息。',
    },
    understandNote: '如果看不懂，把推荐资料原文丢给 AI，让它用生活里的例子讲一遍。',
  });
};
