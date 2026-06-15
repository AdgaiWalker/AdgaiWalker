/**
 * Agent 编排服务 — /api/match 的业务核心
 *
 * 取代旧 question.service.ts：读取 UserContext → 本地匹配 → 按需调模型 → 生成并保存 Need Case → 返回推荐。
 * AI 失败降级到本地规则；Need Case 保存失败不阻断用户响应，但记录 Incident。
 *
 * 六模块分层（见 agent-six-modules-architecture）：
 * - Perception（输入清洗/脱敏/未成年）→ PerceptionService.perceive
 * - Memory（会话/消息/统计）→ MatchSessionRepositoryPort
 * - Planning（本地匹配 + 模型增强 + 字段挑选）→ planRecommendation
 * - 本编排层只负责 perceive → plan → persist → respond 的生命周期串联。
 */

import { randomUUID } from 'node:crypto';

import { compactText } from '@/agent/privacy';
import { callGateway } from '@/agent/gateway';
import { matchSiteResources, type MatchResult } from '@/agent/match';
import { matchResources } from '@/profiles/resource-index';
import {
  abilityTypeLabels,
  aiStageLabels,
  audienceGroupLabels,
  frictionLayerLabels,
  needCategoryLabels,
  type AbilityType,
  type AiStage,
  type AudienceGroup,
  type FrictionLayer,
  type MatchResource,
  type NeedCategory,
} from '@/profiles/resource-index';
import { createPerceptionService } from './perception.service';

import type {
  AgentOrchestratorPort,
  NeedCaseHandleResult,
  PerceptionServicePort,
  PerceivedInput,
} from './interfaces';
import type {
  AgentRecommendation,
  MatchSessionRepositoryPort,
  NeedCase,
  NeedCaseRepositoryPort,
  ProfileSnapshot,
  SafetyFlags,
} from '@/stores/ports';
import type { MatchSession } from '@/conversation/store';
import type { SafetyServicePort } from './interfaces';

const PROMPT_VERSION = 'tool-match-v2';

const FRICTION_LAYERS: FrictionLayer[] = [
  'compliance-entry', 'account-config', 'tool-understanding',
  'scenario-match', 'value-understanding', 'practice-deepening', 'unclear',
];

const ABILITY_TYPES: AbilityType[] = [
  'compliance-path', 'chat-ai', 'code-agent', 'office', 'design',
  'automation', 'learning-path', 'content-navigation', 'clarify',
];

const SYSTEM_PROMPT = `你是小菁，iwalk.pro 的 AI 实践导航助手。
用户可以只说目的，不一定要知道要做成 PPT、视频、文章、海报还是网站。你的任务是先理解目的，再把它变成一个可验证的小行动。
本地规则已经决定 responseMode、能力方向、合规边界和工具列表，不能覆盖。
规则：1. 不要解释分类、层级、系统判断。2. 目的模糊时，先给 2-4 个可能成品方向，再问 1 个关键问题。3. 目标明确时，只给 1 个主工具、最多 2 个备选工具。4. 每次都给一个可直接复制的下一步提示词或操作。5. 不要默认推荐站内资料；用户问教程时再给。6. 遇到账号绕过、验证码绕过、灰色渠道、违规访问，只做合规转向。
只返回 JSON：{"bridge":"自然、简短、可行动的一句话","toolDirection":"可选，工具方向一句话","reason":"可选，简短理由","needSummary":"一句话需求摘要","resourceIds": []}`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
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

/** Planning 阶段产物：本地匹配结果 + 模型增强后的字段 + 串联语/摘要 */
interface PlanResult {
  localMatch: MatchResult;
  resources: MatchResource[];
  categories: NeedCategory[];
  frictionLayer: FrictionLayer;
  abilityType: AbilityType;
  toolDirection: string;
  reason: string;
  bridge: string;
  needSummary: string;
  modelLabel: string | undefined;
  fallbackUsed: boolean;
}

/** 编排层依赖端口 */
interface OrchestratorDeps {
  sessionStore: MatchSessionRepositoryPort;
  needCaseStore: NeedCaseRepositoryPort;
  safetyService: SafetyServicePort;
  perceptionService?: PerceptionServicePort;
}

function parseModelJson(text: string): ModelChoice | null {
  try {
    const jsonText = text.trim().replace(/^\`\`\`json\s*/i, '').replace(/\`\`\`$/i, '').trim();
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
  return providerLabel + '（' + gwConfig.model + '）';
}

async function askModel(input: {
  messages: ChatMessage[];
  localBridge: string;
  localResourceIds: string[];
  audienceGroup?: AudienceGroup;
  aiStage?: AiStage;
}): Promise<ModelChoice | null> {
  const currentModelLabel = await getCurrentModelLabel();
  const userPrompt = [
    '当前模型：' + currentModelLabel,
    '用户人群：' + (input.audienceGroup ? audienceGroupLabels[input.audienceGroup] : '未声明'),
    'AI 阶段：' + (input.aiStage ? aiStageLabels[input.aiStage] : '未声明'),
    '本地初筛资料 ID：' + input.localResourceIds.join('、'),
    '本地串联语：' + input.localBridge,
    '用户对话：',
    input.messages.map(m => m.role + ': ' + m.content).join('\n'),
  ].join('\n');

  const result = await callGateway<ModelChoice | null>(
    { route: 'match.askModel', systemPrompt: SYSTEM_PROMPT, userPrompt },
    null,
    (text) => parseModelJson(text),
  );
  return result.data;
}

function pickResources(ids: string[] | undefined, fallback: MatchResource[]): MatchResource[] {
  if (!ids?.length) return fallback;
  const picked = ids
    .map(id => matchResources.find(r => r.id === id))
    .filter((r): r is MatchResource => Boolean(r));
  return picked.length > 0 ? picked.slice(0, 4) : fallback;
}

function pickFrictionLayer(value: unknown, fallback: FrictionLayer): FrictionLayer {
  return typeof value === 'string' && FRICTION_LAYERS.includes(value as FrictionLayer)
    ? (value as FrictionLayer) : fallback;
}

function pickAbilityType(value: unknown, fallback: AbilityType): AbilityType {
  return typeof value === 'string' && ABILITY_TYPES.includes(value as AbilityType)
    ? (value as AbilityType) : fallback;
}

function pickCategories(value: unknown, fallback: NeedCategory[]): NeedCategory[] {
  if (!Array.isArray(value)) return fallback;
  const picked = value
    .filter((c): c is NeedCategory => typeof c === 'string' && c in needCategoryLabels)
    .slice(0, 3);
  return picked.length > 0 ? picked : fallback;
}

function isModelIdentityQuestion(text: string): boolean {
  return /模型|model/i.test(text);
}

async function createIdentityBridge(text: string): Promise<string> {
  if (!isModelIdentityQuestion(text)) {
    return '我是 iwalk.pro 的 AI 实践导航助手小菁，主要帮你把真实任务拆清楚，再匹配合适的 AI 工具和站内资料。你现在想解决什么事？';
  }
  const modelLabel = await getCurrentModelLabel();
  return '我是 iwalk.pro 的 AI 实践导航助手小菁，这一轮背后调用的是 ' + modelLabel + '。你可以直接说想用 AI 做什么，我帮你判断该用什么工具和路径。';
}

/** frictionLayer → 可读卡点映射（复用 match.ts 已有推断，不引入新规则） */
const FRICTION_TO_STUCK_POINT: Record<FrictionLayer, string> = {
  'compliance-entry': '合规边界',
  'account-config': '账号/API 配置',
  'tool-understanding': '工具理解',
  'scenario-match': '场景匹配',
  'value-understanding': '价值认知',
  'practice-deepening': '实践深化',
  'unclear': '需求不清',
};

function inferRoleFromNeedText(text: string): string | undefined {
  if (/孩子|小孩|娃|儿子|女儿|家长|父母/.test(text)) return '家长';
  if (/学生|大一|大二|大三|大四|考研|作业|课程|学校/.test(text)) return '学生';
  if (/老师|教学|课堂|培训|教案/.test(text)) return '老师 / 培训者';
  if (/老板|领导|同事|汇报|职场|会议|公司|客户/.test(text)) return '职场办公';
  if (/公众号|视频|粉丝|选题|脚本|内容|自媒体/.test(text)) return '内容创作者';
  if (/代码|编程|程序|开发|前端|后端|部署|接口/.test(text)) return '开发者 / 技术从业者';
  if (/副业|创业|自由职业|接单/.test(text)) return '自由职业 / 创业者';
  return undefined;
}

/**
 * 遭遇切片推断（A5）：从本次对话 + 锚点推断此刻角色 / 目标 / 卡点。
 * 复用已有信号（audienceGroup / frictionLayer / needFrame / needSummary），不引入复杂推断。
 * 推断失败（无 audience 信号 + 无锚点）静默降级：sliceInferred=false。
 */
function inferEncounterSlice(input: {
  personaAnchor?: string;
  audienceGroup?: AudienceGroup;
  frictionLayer: FrictionLayer;
  needFramePurpose?: string;
  needSummary: string;
  latestNeed: string;
}): ProfileSnapshot {
  const { personaAnchor, audienceGroup, frictionLayer, needFramePurpose, needSummary, latestNeed } = input;
  // prefer-not-say 视为无信号，回退锚点（避免 roleInContext 被设成"不想说"）
  const audienceLabel = audienceGroup && audienceGroup !== 'prefer-not-say'
    ? audienceGroupLabels[audienceGroup]
    : undefined;
  const messageRole = inferRoleFromNeedText(latestNeed);

  // roleInContext：本次问题角色信号优先，其次显式 audienceGroup，最后才回退锚点
  const roleInContext = messageRole ?? audienceLabel ?? personaAnchor;
  // goal：原始需求 purpose，否则摘要
  const goal = needFramePurpose || needSummary;
  // stuckPoint：frictionLayer 映射成可读卡点
  const stuckPoint = FRICTION_TO_STUCK_POINT[frictionLayer];
  // socialContext：本次角色信号或 audienceGroup 映射（学生/职场/家长/创作者…）
  const socialContext = messageRole ?? audienceLabel;
  // sliceInferred：只有本次问题或显式 audience 提供角色信号才算成功；锚点回退是低置信。
  const sliceInferred = Boolean(messageRole ?? audienceLabel);

  return {
    roleInContext,
    goal,
    stuckPoint,
    socialContext,
    personaAnchor,
    sliceInferred,
    capturedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 生命周期步骤函数（receive → perceive → plan → persist → respond）
// ---------------------------------------------------------------------------

/** Planning：本地规则匹配 + 按需模型增强 + 字段挑选 + 串联语/摘要压缩 */
async function planRecommendation(input: {
  perceived: PerceivedInput;
  audienceGroup?: AudienceGroup;
  aiStage?: AiStage;
}): Promise<PlanResult> {
  const { perceived, audienceGroup, aiStage } = input;

  const localMatch = matchSiteResources({
    need: perceived.latestNeedRedacted.text,
    audienceGroup,
    aiStage,
  });

  let modelChoice: ModelChoice | null = null;
  let modelCalled = false;
  // 本地无工具推荐时，才调用模型补充
  if (localMatch.responseMode === 'recommendation' && localMatch.recommendedTools.length === 0) {
    modelCalled = true;
    modelChoice = await askModel({
      messages: perceived.messages,
      localBridge: localMatch.bridge,
      localResourceIds: localMatch.resources.map(r => r.id),
      audienceGroup,
      aiStage,
    });
  }

  const resources = localMatch.responseMode === 'recommendation' && localMatch.resources.length > 0
    ? (localMatch.recommendedTools.length > 0
      ? localMatch.resources
      : pickResources(modelChoice?.resourceIds, localMatch.resources))
    : [];

  // bridge 先于 modelLabel 求值，保持与重构前一致的 await 顺序
  const bridge = compactText(
    localMatch.responseMode === 'identity'
      ? await createIdentityBridge(perceived.latestNeedRedacted.text)
      : localMatch.bridge,
    220,
  );

  let modelLabel: string | undefined;
  if (modelCalled) {
    try { modelLabel = await getCurrentModelLabel(); } catch { modelLabel = undefined; }
  }

  return {
    localMatch,
    resources,
    categories: pickCategories(localMatch.categories, localMatch.categories),
    frictionLayer: pickFrictionLayer(localMatch.frictionLayer, localMatch.frictionLayer),
    abilityType: pickAbilityType(localMatch.recommendedAbilityType, localMatch.recommendedAbilityType),
    toolDirection: localMatch.responseMode === 'recommendation' ? compactText(localMatch.toolDirection, 140) : '',
    reason: localMatch.responseMode === 'recommendation' ? compactText(localMatch.reason, 140) : '',
    bridge,
    needSummary: compactText(
      perceived.latestNeedRedacted.text || '用户想找到合适的 AI 工具和站内资料',
      100,
    ),
    modelLabel,
    fallbackUsed: modelCalled && modelChoice === null,
  };
}

/** Memory：会话构建 + upsert + 统计增量 + 对话消息保存（均 fire-and-forget，失败不阻断） */
async function persistSession(input: {
  sessionStore: MatchSessionRepositoryPort;
  sessionId: string;
  perceived: PerceivedInput;
  rawMessages: ChatMessage[];
  sourcePage?: string;
  consentForTopic?: boolean;
  audienceGroup?: AudienceGroup;
  aiStage?: AiStage;
  plan: PlanResult;
}): Promise<MatchSession> {
  const { sessionStore, sessionId, perceived, rawMessages, plan } = input;
  const now = new Date().toISOString();

  const session: MatchSession = {
    sessionId,
    startedAt: now,
    lastActiveAt: now,
    sourcePage: input.sourcePage ?? '/tools',
    messageCount: rawMessages.filter(m => m.role === 'user').length,
    consentForTopic: input.consentForTopic !== false,
    audienceGroup: input.audienceGroup,
    aiStage: input.aiStage,
    isMinorContext: perceived.isMinorContext,
    promptVersion: PROMPT_VERSION,
    modelVersion: 'gateway-managed',
  };

  await sessionStore.upsert(session);

  const { responseMode } = plan.localMatch;
  if (responseMode === 'recommendation' || responseMode === 'compliance') {
    sessionStore.incrementStats(plan.categories).catch(() => {});
  }

  const conversationMsgs = perceived.messages.map(m => ({
    role: m.role,
    content: m.content,
    timestamp: now,
  }));
  conversationMsgs.push({ role: 'assistant', content: plan.bridge || plan.needSummary, timestamp: now });
  sessionStore.saveMessages(sessionId, conversationMsgs).catch(() => {});

  return session;
}

/** 把 Planning 产物组装成持久化的 AgentRecommendation 快照 */
function buildAgentRecommendation(plan: PlanResult): AgentRecommendation {
  const { localMatch } = plan;
  const actionPlanSource = localMatch.actionPlan;
  return {
    responseMode: localMatch.responseMode,
    bridge: plan.bridge,
    toolDirection: plan.toolDirection || undefined,
    reason: plan.reason || undefined,
    fallbackUsed: plan.fallbackUsed,
    resourceIds: plan.resources.map(r => r.id),
    recommendedTools: localMatch.recommendedTools.map(t => ({ id: t.id, name: t.name })),
    actionPlan: (localMatch.responseMode === 'recommendation' || localMatch.responseMode === 'diagnosis') && actionPlanSource
      ? {
          ...(actionPlanSource.primaryTool ? { primaryTool: actionPlanSource.primaryTool } : {}),
          backupTools: actionPlanSource.backupTools.map(t => ({
            id: t.id, name: t.name, tagline: t.tagline,
            useFor: t.useFor, nextStep: t.nextStep, fit: t.fit,
          })),
          prompt: actionPlanSource.prompt,
          nextStep: actionPlanSource.nextStep,
        }
      : undefined,
    needFrame: localMatch.needFrame,
    diagnosisOptions: localMatch.responseMode === 'diagnosis' ? localMatch.diagnosisOptions : [],
    modelLabel: plan.modelLabel,
  };
}

/** 生成并保存 NeedCase；保存失败记录 Incident 并返回 undefined，不阻断用户响应 */
async function recordNeedCase(input: {
  needCaseStore: NeedCaseRepositoryPort;
  safetyService: SafetyServicePort;
  sessionId: string;
  sourcePage: string;
  perceived: PerceivedInput;
  plan: PlanResult;
  audienceGroup?: AudienceGroup;
  aiStage?: AiStage;
  personaAnchor?: string;
  safetyFlags: SafetyFlags;
  agentRecommendation: AgentRecommendation;
}): Promise<string | undefined> {
  const { needCaseStore, safetyService, sessionId, sourcePage, perceived, plan, audienceGroup, aiStage, personaAnchor, safetyFlags, agentRecommendation } = input;
  const now = new Date().toISOString();
  const isMinorContext = perceived.isMinorContext;

  const needCaseId = randomUUID();
  const profileSnapshot = inferEncounterSlice({
    personaAnchor,
    audienceGroup,
    frictionLayer: plan.frictionLayer,
    needFramePurpose: plan.localMatch.needFrame.purpose,
    needSummary: plan.needSummary,
    latestNeed: perceived.latestNeedRedacted.text,
  });

  const needCase: NeedCase = {
    needCaseId,
    sessionId,
    createdAt: now,
    updatedAt: now,
    sourcePage,
    rawNeedRedacted: isMinorContext ? '[青少年/未成年场景不保存原始问题]' : perceived.latestNeedRedacted.text,
    needSummary: plan.needSummary,
    needCategories: plan.categories,
    frictionLayer: plan.frictionLayer,
    recommendedAbilityType: plan.abilityType,
    toolDirection: plan.toolDirection,
    recommendedContentIds: plan.resources.map(r => r.id),
    recommendedToolIds: plan.localMatch.recommendedTools.map(t => t.id),
    audienceGroup,
    aiStage,
    profileSnapshot,
    sliceInferred: profileSnapshot.sliceInferred,
    agentRecommendation,
    feedbackStatus: 'none',
    adminReviewStatus: 'pending',
    safetyFlags,
  };

  try {
    await needCaseStore.save(needCase);
    return needCaseId;
  } catch {
    await safetyService.recordIncident({
      scope: 'need-case-save',
      severity: 'medium',
      message: 'Need Case 保存失败，用户响应未受影响。',
      relatedNeedCaseId: needCaseId,
      relatedSessionId: sessionId,
    });
    return undefined;
  }
}

/** 组装返回给前端的响应载荷 */
function buildResponsePayload(input: {
  plan: PlanResult;
  agentRecommendation: AgentRecommendation;
  safetyFlags: SafetyFlags;
  isMinorContext: boolean;
}): Record<string, unknown> {
  const { plan, agentRecommendation, safetyFlags, isMinorContext } = input;
  const { localMatch } = plan;
  const responseMode = localMatch.responseMode;

  return {
    responseMode,
    frictionLayer: plan.frictionLayer,
    frictionLayerLabel: frictionLayerLabels[plan.frictionLayer],
    recommendedAbilityType: plan.abilityType,
    recommendedAbilityLabel: abilityTypeLabels[plan.abilityType],
    toolDirection: plan.toolDirection,
    reason: plan.reason,
    bridge: plan.bridge,
    needSummary: plan.needSummary,
    categories: responseMode === 'recommendation'
      ? plan.categories.map(c => ({ id: c, label: needCategoryLabels[c] }))
      : [],
    resources: responseMode === 'recommendation'
      ? plan.resources.map(r => ({
          id: r.id, title: r.title, href: r.href,
          kind: r.kind, useFor: r.useFor, summary: r.summary,
        }))
      : [],
    recommendedTools: responseMode === 'recommendation'
      ? localMatch.recommendedTools.map(t => ({
          id: t.id, name: t.name, tagline: t.tagline,
          useFor: t.useFor, nextStep: t.nextStep, fit: t.fit,
        }))
      : [],
    needFrame: localMatch.needFrame,
    diagnosisOptions: responseMode === 'diagnosis' ? localMatch.diagnosisOptions : [],
    actionPlan: agentRecommendation.actionPlan,
    safety: {
      piiDetected: safetyFlags.piiDetected,
      consentForTopic: safetyFlags.consentForTopic,
      isMinorContext,
      complianceRedirected: safetyFlags.complianceRedirected,
      note: '请不要输入姓名、联系方式、API Key、公司机密等敏感信息。',
    },
  };
}

export function createAgentOrchestrator(deps: OrchestratorDeps): AgentOrchestratorPort {
  const perceptionService = deps.perceptionService ?? createPerceptionService();
  return {
    async handleNeed(input): Promise<NeedCaseHandleResult> {
      const audienceGroup = input.audienceGroup as AudienceGroup | undefined;
      const aiStage = input.aiStage as AiStage | undefined;

      // 1. perceive — 截断、PII 脱敏、压缩、未成年标记
      const perceived = perceptionService.perceive({
        messages: input.messages,
        audienceGroup,
      });

      // 2. plan — 本地匹配 + 模型增强 + 字段挑选
      const plan = await planRecommendation({ perceived, audienceGroup, aiStage });

      // 3. persist — 会话 + 统计 + 对话消息（fire-and-forget）
      const sessionId = input.sessionId || input.userContext.sessionId || deps.sessionStore.createSessionId();
      const session = await persistSession({
        sessionStore: deps.sessionStore,
        sessionId,
        perceived,
        rawMessages: input.messages,
        sourcePage: input.sourcePage,
        consentForTopic: input.consentForTopic,
        audienceGroup,
        aiStage,
        plan,
      });

      // 4. safety flags + recommendation 快照
      const safetyFlags: SafetyFlags = {
        piiDetected: perceived.latestNeedRedacted.piiDetected,
        piiRemoved: perceived.latestNeedRedacted.piiDetected,
        isMinorContext: perceived.isMinorContext,
        complianceRedirected: plan.localMatch.complianceRedirected || plan.frictionLayer === 'compliance-entry',
        codeAgentMisuseLikely: plan.localMatch.codeAgentMisuseLikely,
        consentForTopic: session.consentForTopic,
      };
      const agentRecommendation = buildAgentRecommendation(plan);

      // 5. record NeedCase（仅在用户同意 + recommendation/compliance 模式）
      let needCaseId: string | undefined;
      const shouldRecord = session.consentForTopic
        && (plan.localMatch.responseMode === 'recommendation' || plan.localMatch.responseMode === 'compliance');
      if (shouldRecord) {
        needCaseId = await recordNeedCase({
          needCaseStore: deps.needCaseStore,
          safetyService: deps.safetyService,
          sessionId,
          sourcePage: session.sourcePage,
          perceived,
          plan,
          audienceGroup,
          aiStage,
          personaAnchor: input.userContext.profile?.personaAnchor,
          safetyFlags,
          agentRecommendation,
        });
      }

      // 6. respond — 组装返回载荷
      const responsePayload = buildResponsePayload({
        plan,
        agentRecommendation,
        safetyFlags,
        isMinorContext: perceived.isMinorContext,
      });

      return {
        needCaseId,
        sessionId,
        responsePayload,
        fallbackUsed: plan.fallbackUsed,
      };
    },
  };
}
