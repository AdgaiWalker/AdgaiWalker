import { createHash, randomUUID } from 'node:crypto';

import type { APIRoute } from 'astro';
import { Redis } from '@upstash/redis';

import {
  abilityTypeLabels,
  aiStageLabels,
  audienceGroupLabels,
  frictionLayerLabels,
  matchResources,
  needCategoryLabels,
  type AbilityType,
  type AiStage,
  type AudienceGroup,
  type FrictionLayer,
  type MatchResource,
  type NeedCategory,
} from '@/profiles/resource-index';
import { compactText, isMinorAudience, redactSensitiveText } from '@/agent/privacy';
import { callGateway } from '@/agent/gateway';
import {
  matchSiteResources,
  type ActionPlan,
  type DiagnosisOption,
  type NeedFrame,
  type RecommendedTool,
  type ResponseMode,
} from '@/agent/match';
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
  frictionLayer?: FrictionLayer;
  recommendedAbilityType?: AbilityType;
  toolDirection?: string;
  reason?: string;
  inferredAudience?: AudienceGroup;
  inferredAiStage?: AiStage;
}

interface MatchResponsePayload {
  eventId?: string;
  sessionId: string;
  remaining: number;
  responseMode: ResponseMode;
  frictionLayer: FrictionLayer;
  frictionLayerLabel: string;
  recommendedAbilityType: AbilityType;
  recommendedAbilityLabel: string;
  toolDirection: string;
  reason: string;
  bridge: string;
  needSummary: string;
  categories: Array<{ id: NeedCategory; label: string }>;
  resources: Array<{
    id: string;
    title: string;
    href: string;
    kind: MatchResource['kind'];
    useFor: string;
    summary: string;
  }>;
  recommendedTools: Array<{
    id: string;
    name: string;
    tagline: string;
    useFor: string;
    nextStep: string;
    fit: RecommendedTool['fit'];
  }>;
  needFrame: NeedFrame;
  diagnosisOptions: DiagnosisOption[];
  actionPlan?: {
    primaryTool?: {
      id: string;
      name: string;
      tagline: string;
      useFor: string;
      nextStep: string;
      fit: RecommendedTool['fit'];
    };
    backupTools: Array<{
      id: string;
      name: string;
      tagline: string;
      useFor: string;
      nextStep: string;
      fit: RecommendedTool['fit'];
    }>;
    prompt: string;
    nextStep: string;
  };
  safety: {
    piiDetected: boolean;
    consentForTopic: boolean;
    isMinorContext: boolean;
    complianceRedirected: boolean;
    note: string;
  };
  understandNote?: string;
}

const PROMPT_VERSION = 'tool-match-v2';
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

const FRICTION_LAYERS: FrictionLayer[] = [
  'compliance-entry',
  'account-config',
  'tool-understanding',
  'scenario-match',
  'value-understanding',
  'practice-deepening',
  'unclear',
];

const ABILITY_TYPES: AbilityType[] = [
  'compliance-path',
  'chat-ai',
  'code-agent',
  'office',
  'design',
  'automation',
  'learning-path',
  'content-navigation',
  'clarify',
];

const SYSTEM_PROMPT = `你是小秋，iwalk.pro 的 AI 实践导航助手。

用户可以只说目的，不一定知道要做成 PPT、视频、文章、海报还是网站。
你的任务是先理解目的，再把它变成一个可验证的小行动。

本地规则已经决定 responseMode、能力方向、合规边界和工具列表，不能覆盖。

规则：
1. 不要解释分类、层级、系统判断。
2. 目的模糊时，先给 2-4 个可能成品方向，再问 1 个关键问题。
3. 目标明确时，只给 1 个主工具、最多 2 个备选工具。
4. 每次都给一个可直接复制的下一步提示词或操作。
5. 不要默认推荐站内资料；用户问教程时再给。
6. 遇到账号绕过、验证码绕过、灰色渠道、违规访问，只做合规转向。

只返回 JSON：
{
  "bridge": "自然、简短、可行动的一句话",
  "toolDirection": "可选，工具方向一句话",
  "reason": "可选，简短理由",
  "needSummary": "一句话需求摘要",
  "resourceIds": []
}`;

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

function normalizeUserText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isDirectToolFollowUp(text: string): boolean {
  const normalized = normalizeUserText(text);
  return [
    '直接一点',
    '直接点',
    '本地有的工具',
    '推本地',
    '直接推',
    '给我工具',
    '推荐工具',
    '别讲资料',
    '不要资料',
  ].some(keyword => normalized.includes(keyword));
}

function isThinSocialTurn(text: string): boolean {
  const compacted = normalizeUserText(text).replace(/[，。！？、；：,.!?;:\s]/g, '');
  return ['你好', '您好', '嗨', '哈喽', 'hello', 'hi', '在吗', '在不在', '你是谁', '你是什么', '你是什么模型'].includes(compacted);
}

function getMatchingNeed(messages: ChatMessage[]): string {
  const latest = getLatestUserNeed(messages);
  if (!isDirectToolFollowUp(latest)) return latest;

  const previous = [...messages]
    .reverse()
    .filter(message => message.role === 'user')
    .map(message => message.content)
    .find(content => content !== latest && !isThinSocialTurn(content));

  return previous ? `${previous}\n${latest}` : latest;
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

function pickFrictionLayer(value: unknown, fallback: FrictionLayer): FrictionLayer {
  return typeof value === 'string' && FRICTION_LAYERS.includes(value as FrictionLayer)
    ? value as FrictionLayer
    : fallback;
}

function pickAbilityType(value: unknown, fallback: AbilityType): AbilityType {
  return typeof value === 'string' && ABILITY_TYPES.includes(value as AbilityType)
    ? value as AbilityType
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

async function getCurrentModelLabel(): Promise<string> {
  const { getGatewayConfig } = await import('@/agent/gateway-config');
  const gwConfig = await getGatewayConfig();
  const providerLabel = gwConfig.provider === 'deepseek' ? 'DeepSeek'
    : gwConfig.provider === 'anthropic' ? 'Claude'
    : gwConfig.provider === 'openai' ? 'OpenAI'
    : gwConfig.model;
  return `${providerLabel}（${gwConfig.model}）`;
}

// 替换后的 askModel 函数
async function askModel(input: {
  messages: ChatMessage[];
  localBridge: string;
  localResourceIds: string[];
  audienceGroup?: AudienceGroup;
  aiStage?: AiStage;
}): Promise<ModelChoice | null> {
  // 获取当前模型名，注入到 prompt 让 AI 能回答"你是什么模型"
  const currentModelLabel = await getCurrentModelLabel();

  const userPrompt = [
    `当前模型：${currentModelLabel}`,
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
      // 不传 model/maxTokens/timeoutMs → 由 Gateway 运行时配置决定
    },
    null,
    (text) => parseModelJson(text),
  );

  return result.data;
}

function summarizeNeed(text: string): string {
  return compactText(text, 80) || '用户想找到合适的 AI 工具和站内资料';
}

function isModelIdentityQuestion(text: string): boolean {
  return /模型|model/i.test(text);
}

async function createIdentityBridge(text: string): Promise<string> {
  if (!isModelIdentityQuestion(text)) {
    return '我是 iwalk.pro 的 AI 实践导航助手小秋，主要帮你把真实任务拆清楚，再匹配合适的 AI 工具和站内资料。你现在想解决什么事？';
  }
  const modelLabel = await getCurrentModelLabel();
  return `我是 iwalk.pro 的 AI 实践导航助手小秋，这一轮背后调用的是 ${modelLabel}。你可以直接说想用 AI 做什么，我帮你判断该用什么工具和路径。`;
}

function shouldRecordDemand(responseMode: ResponseMode): boolean {
  return responseMode === 'recommendation' || responseMode === 'compliance';
}

function createMatchResponse(input: {
  eventId?: string;
  session: MatchSession;
  remaining: number;
  responseMode: ResponseMode;
  frictionLayer: FrictionLayer;
  recommendedAbilityType: AbilityType;
  toolDirection: string;
  reason: string;
  bridge: string;
  needSummary: string;
  categories: NeedCategory[];
  resources: MatchResource[];
  recommendedTools: RecommendedTool[];
  needFrame: NeedFrame;
  diagnosisOptions: DiagnosisOption[];
  actionPlan?: ActionPlan;
  piiDetected: boolean;
  isMinorContext: boolean;
  complianceRedirected: boolean;
}): MatchResponsePayload {
  const includeRecommendationDetails = input.responseMode === 'recommendation';
  const includeDiagnosisDetails = input.responseMode === 'diagnosis';
  const serializeTool = (tool: RecommendedTool) => ({
    id: tool.id,
    name: tool.name,
    tagline: tool.tagline,
    useFor: tool.useFor,
    nextStep: tool.nextStep,
    fit: tool.fit,
  });
  return {
    ...(input.eventId ? { eventId: input.eventId } : {}),
    sessionId: input.session.sessionId,
    remaining: input.remaining,
    responseMode: input.responseMode,
    frictionLayer: input.frictionLayer,
    frictionLayerLabel: frictionLayerLabels[input.frictionLayer],
    recommendedAbilityType: input.recommendedAbilityType,
    recommendedAbilityLabel: abilityTypeLabels[input.recommendedAbilityType],
    toolDirection: includeRecommendationDetails ? input.toolDirection : '',
    reason: includeRecommendationDetails ? input.reason : '',
    bridge: input.bridge,
    needSummary: input.needSummary,
    categories: includeRecommendationDetails
      ? input.categories.map(category => ({
        id: category,
        label: needCategoryLabels[category],
      }))
      : [],
    resources: includeRecommendationDetails
      ? input.resources.map(resource => ({
        id: resource.id,
        title: resource.title,
        href: resource.href,
        kind: resource.kind,
        useFor: resource.useFor,
        summary: resource.summary,
      }))
      : [],
    recommendedTools: includeRecommendationDetails
      ? input.recommendedTools.map(serializeTool)
      : [],
    needFrame: input.needFrame,
    diagnosisOptions: includeDiagnosisDetails ? input.diagnosisOptions : [],
    ...((includeRecommendationDetails || includeDiagnosisDetails) && input.actionPlan
      ? {
        actionPlan: {
          ...(input.actionPlan.primaryTool ? { primaryTool: serializeTool(input.actionPlan.primaryTool) } : {}),
          backupTools: input.actionPlan.backupTools.map(serializeTool),
          prompt: input.actionPlan.prompt,
          nextStep: input.actionPlan.nextStep,
        },
      }
      : {}),
    safety: {
      piiDetected: input.piiDetected,
      consentForTopic: input.session.consentForTopic,
      isMinorContext: input.isMinorContext,
      complianceRedirected: input.complianceRedirected,
      note: '请不要输入姓名、联系方式、API Key、公司机密等敏感信息。',
    },
  };
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
    modelVersion: 'gateway-managed',
  };
}

function buildDemandEvent(input: {
  session: MatchSession;
  redactedNeed: string;
  needSummary: string;
  categories: NeedCategory[];
  resourceIds: string[];
  piiDetected: boolean;
  frictionLayer: FrictionLayer;
  recommendedAbilityType: AbilityType;
  toolDirection: string;
  complianceRedirected: boolean;
  codeAgentMisuseLikely: boolean;
}): DemandEvent {
  return {
    eventId: randomUUID(),
    sessionId: input.session.sessionId,
    createdAt: new Date().toISOString(),
    rawNeedRedacted: input.session.isMinorContext ? '[青少年/未成年场景不保存原始问题]' : input.redactedNeed,
    needSummary: input.needSummary,
    needCategories: input.categories,
    frictionLayer: input.frictionLayer,
    recommendedAbilityType: input.recommendedAbilityType,
    toolDirection: input.toolDirection,
    complianceRedirected: input.complianceRedirected,
    codeAgentMisuseLikely: input.codeAgentMisuseLikely,
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
  const matchingNeed = getMatchingNeed(body.messages);
  const redactedLatest = redactSensitiveText(compactText(latestNeed, MAX_MESSAGE_LENGTH));
  const redacted = redactSensitiveText(compactText(matchingNeed, MAX_MESSAGE_LENGTH));
  const localMatch = matchSiteResources({
    need: redacted.text,
    audienceGroup: body.audienceGroup,
    aiStage: body.aiStage,
  });

  const modelChoice = localMatch.responseMode === 'recommendation' && localMatch.recommendedTools.length === 0
    ? await askModel({
      messages: clean,
      localBridge: localMatch.bridge,
      localResourceIds: localMatch.resources.map(resource => resource.id),
      audienceGroup: body.audienceGroup,
      aiStage: body.aiStage,
    })
    : null;

  const resources = localMatch.responseMode === 'recommendation' && localMatch.resources.length > 0
    ? (localMatch.recommendedTools.length > 0
      ? localMatch.resources
      : pickResources(modelChoice?.resourceIds, localMatch.resources))
    : [];
  const categories = pickCategories(localMatch.categories, localMatch.categories);
  const frictionLayer = pickFrictionLayer(localMatch.frictionLayer, localMatch.frictionLayer);
  const recommendedAbilityType = pickAbilityType(localMatch.recommendedAbilityType, localMatch.recommendedAbilityType);
  const toolDirection = localMatch.responseMode === 'recommendation'
    ? compactText(localMatch.toolDirection, 140)
    : '';
  const reason = localMatch.responseMode === 'recommendation'
    ? compactText(localMatch.reason, 140)
    : '';
  const bridge = compactText(
    localMatch.responseMode === 'identity'
      ? await createIdentityBridge(redactedLatest.text)
      : localMatch.bridge,
    220,
  );
  const needSummary = compactText(summarizeNeed(redacted.text), 100);
  const session = await buildSession(body, isMinorContext);

  await upsertMatchSession(session);

  if (shouldRecordDemand(localMatch.responseMode)) {
    // 公开统计计数（不阻塞响应）
    incrementMatchStats(categories).catch(() => {});
  }

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

  if (session.consentForTopic && shouldRecordDemand(localMatch.responseMode)) {
    const demandEvent = buildDemandEvent({
      session,
      redactedNeed: redacted.text,
      needSummary,
      categories,
      resourceIds: resources.map(resource => resource.id),
      piiDetected: redacted.piiDetected,
      frictionLayer,
      recommendedAbilityType,
      toolDirection,
      complianceRedirected: localMatch.complianceRedirected || frictionLayer === 'compliance-entry',
      codeAgentMisuseLikely: localMatch.codeAgentMisuseLikely,
    });
    await saveDemandEvent(demandEvent);
    return jsonResponse(createMatchResponse({
      eventId: demandEvent.eventId,
      remaining: rateLimit.remaining,
      session,
      responseMode: localMatch.responseMode,
      frictionLayer,
      recommendedAbilityType,
      toolDirection,
      reason,
      bridge,
      needSummary,
      categories,
      resources,
      recommendedTools: localMatch.recommendedTools,
      needFrame: localMatch.needFrame,
      diagnosisOptions: localMatch.diagnosisOptions,
      actionPlan: localMatch.actionPlan,
      piiDetected: redacted.piiDetected,
      isMinorContext,
      complianceRedirected: Boolean(demandEvent.complianceRedirected),
    }));
  }

  return jsonResponse(createMatchResponse({
    session,
    remaining: rateLimit.remaining,
    responseMode: localMatch.responseMode,
    frictionLayer,
    recommendedAbilityType,
    toolDirection,
    reason,
    bridge,
    needSummary,
    categories,
    resources,
    recommendedTools: localMatch.recommendedTools,
    needFrame: localMatch.needFrame,
    diagnosisOptions: localMatch.diagnosisOptions,
    actionPlan: localMatch.actionPlan,
    piiDetected: redacted.piiDetected,
    isMinorContext,
    complianceRedirected: localMatch.complianceRedirected || frictionLayer === 'compliance-entry',
  }));
};
