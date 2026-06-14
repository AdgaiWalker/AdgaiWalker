/**
 * Agent 编排服务 — /api/match 的业务核心
 *
 * 取代旧 question.service.ts：
 * 读取 UserContext → 本地匹配 → 按需调模型 → 生成并保存 Need Case → 返回推荐。
 * AI 失败降级到本地规则；Need Case 保存失败不阻断用户响应，但记录 Incident。
 */

import { randomUUID } from 'node:crypto';

import { compactText, isMinorAudience, redactSensitiveText } from '@/agent/privacy';
import { callGateway } from '@/agent/gateway';
import { matchSiteResources } from '@/agent/match';
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
import {
  createSessionId,
  incrementMatchStats,
  saveConversationMessages,
} from '@/conversation/store';

import type { AgentOrchestratorPort, NeedCaseHandleResult, UserContext } from './interfaces';
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
const MAX_MESSAGES = 16;
const MAX_MESSAGE_LENGTH = 500;

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

function cleanMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-MAX_MESSAGES).map(m => ({
    role: m.role,
    content: redactSensitiveText(compactText(m.content, MAX_MESSAGE_LENGTH)).text,
  }));
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
}): ProfileSnapshot {
  const { personaAnchor, audienceGroup, frictionLayer, needFramePurpose, needSummary } = input;
  // prefer-not-say 视为无信号，回退锚点（避免 roleInContext 被设成"不想说"）
  const audienceLabel = audienceGroup && audienceGroup !== 'prefer-not-say'
    ? audienceGroupLabels[audienceGroup]
    : undefined;

  // roleInContext：前端显式 audienceGroup 优先，否则锚点，都无则 undefined
  const roleInContext = audienceLabel ?? personaAnchor;
  // goal：原始需求 purpose，否则摘要
  const goal = needFramePurpose || needSummary;
  // stuckPoint：frictionLayer 映射成可读卡点
  const stuckPoint = FRICTION_TO_STUCK_POINT[frictionLayer];
  // socialContext：audienceGroup 映射（学生/职场/家长/创作者…）
  const socialContext = audienceLabel;
  // sliceInferred：有 roleInContext（audience 或 anchor）即 true；都没有 → false（低置信度）
  const sliceInferred = Boolean(roleInContext);

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

export function createAgentOrchestrator(deps: {
  sessionStore: MatchSessionRepositoryPort;
  needCaseStore: NeedCaseRepositoryPort;
  safetyService: SafetyServicePort;
}): AgentOrchestratorPort {
  return {
    async handleNeed(input): Promise<NeedCaseHandleResult> {
      const audienceGroup = input.audienceGroup as AudienceGroup | undefined;
      const aiStage = input.aiStage as AiStage | undefined;
      const isMinorContext = isMinorAudience(audienceGroup);

      const clean = cleanMessages(input.messages);
      const latestNeed = [...input.messages].reverse().find(m => m.role === 'user')?.content ?? '';
      const redacted = redactSensitiveText(compactText(latestNeed, MAX_MESSAGE_LENGTH));

      const localMatch = matchSiteResources({
        need: redacted.text,
        audienceGroup,
        aiStage,
      });

      let modelChoice: ModelChoice | null = null;
      let modelCalled = false;
      if (localMatch.responseMode === 'recommendation' && localMatch.recommendedTools.length === 0) {
        modelCalled = true;
        modelChoice = await askModel({
          messages: clean,
          localBridge: localMatch.bridge,
          localResourceIds: localMatch.resources.map(r => r.id),
          audienceGroup,
          aiStage,
        });
      }
      const fallbackUsed = modelCalled && modelChoice === null;

      const resources = localMatch.responseMode === 'recommendation' && localMatch.resources.length > 0
        ? (localMatch.recommendedTools.length > 0
          ? localMatch.resources
          : pickResources(modelChoice?.resourceIds, localMatch.resources))
        : [];

      const categories = pickCategories(localMatch.categories, localMatch.categories);
      const frictionLayer = pickFrictionLayer(localMatch.frictionLayer, localMatch.frictionLayer);
      const abilityType = pickAbilityType(localMatch.recommendedAbilityType, localMatch.recommendedAbilityType);
      const toolDirection = localMatch.responseMode === 'recommendation'
        ? compactText(localMatch.toolDirection, 140) : '';
      const reason = localMatch.responseMode === 'recommendation'
        ? compactText(localMatch.reason, 140) : '';

      const bridge = compactText(
        localMatch.responseMode === 'identity'
          ? await createIdentityBridge(redacted.text)
          : localMatch.bridge,
        220,
      );

      const needSummary = compactText(
        redacted.text || '用户想找到合适的 AI 工具和站内资料',
        100,
      );

      let modelLabel: string | undefined;
      if (modelCalled) {
        try { modelLabel = await getCurrentModelLabel(); } catch { modelLabel = undefined; }
      }

      const now = new Date().toISOString();
      const sessionId = input.sessionId || input.userContext.sessionId || createSessionId();

      const session: MatchSession = {
        sessionId,
        startedAt: now,
        lastActiveAt: now,
        sourcePage: input.sourcePage ?? '/tools',
        messageCount: input.messages.filter(m => m.role === 'user').length,
        consentForTopic: input.consentForTopic !== false,
        audienceGroup,
        aiStage,
        isMinorContext,
        promptVersion: PROMPT_VERSION,
        modelVersion: 'gateway-managed',
      };

      await deps.sessionStore.upsert(session);

      if (localMatch.responseMode === 'recommendation' || localMatch.responseMode === 'compliance') {
        incrementMatchStats(categories).catch(() => {});
      }

      const conversationMsgs = clean.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: now,
      }));
      conversationMsgs.push({ role: 'assistant', content: bridge || needSummary, timestamp: now });
      saveConversationMessages(sessionId, conversationMsgs).catch(() => {});

      const safetyFlags: SafetyFlags = {
        piiDetected: redacted.piiDetected,
        piiRemoved: redacted.piiDetected,
        isMinorContext,
        complianceRedirected: localMatch.complianceRedirected || frictionLayer === 'compliance-entry',
        codeAgentMisuseLikely: localMatch.codeAgentMisuseLikely,
        consentForTopic: session.consentForTopic,
      };

      const agentRecommendation: AgentRecommendation = {
        responseMode: localMatch.responseMode,
        bridge,
        toolDirection: toolDirection || undefined,
        reason: reason || undefined,
        fallbackUsed,
        resourceIds: resources.map(r => r.id),
        recommendedTools: localMatch.recommendedTools.map(t => ({ id: t.id, name: t.name })),
        actionPlan: (localMatch.responseMode === 'recommendation' || localMatch.responseMode === 'diagnosis') && localMatch.actionPlan
          ? {
              ...(localMatch.actionPlan.primaryTool ? { primaryTool: localMatch.actionPlan.primaryTool } : {}),
              backupTools: localMatch.actionPlan.backupTools.map(t => ({
                id: t.id, name: t.name, tagline: t.tagline,
                useFor: t.useFor, nextStep: t.nextStep, fit: t.fit,
              })),
              prompt: localMatch.actionPlan.prompt,
              nextStep: localMatch.actionPlan.nextStep,
            }
          : undefined,
        needFrame: localMatch.needFrame,
        diagnosisOptions: localMatch.responseMode === 'diagnosis' ? localMatch.diagnosisOptions : [],
        modelLabel,
      };

      // 生成 Need Case 并保存（失败不阻断用户响应）
      let needCaseId: string | undefined;
      const shouldRecord = session.consentForTopic && (localMatch.responseMode === 'recommendation' || localMatch.responseMode === 'compliance');

      if (shouldRecord) {
        needCaseId = randomUUID();
        const needCase: NeedCase = {
          needCaseId,
          sessionId,
          createdAt: now,
          updatedAt: now,
          sourcePage: session.sourcePage,
          rawNeedRedacted: isMinorContext ? '[青少年/未成年场景不保存原始问题]' : redacted.text,
          needSummary,
          needCategories: categories,
          frictionLayer,
          recommendedAbilityType: abilityType,
          toolDirection,
          recommendedContentIds: resources.map(r => r.id),
          recommendedToolIds: localMatch.recommendedTools.map(t => t.id),
          audienceGroup,
          aiStage,
          profileSnapshot: inferEncounterSlice({
            personaAnchor: input.userContext.profile?.personaAnchor,
            audienceGroup,
            frictionLayer,
            needFramePurpose: localMatch.needFrame.purpose,
            needSummary,
          }),
          agentRecommendation,
          feedbackStatus: 'none',
          adminReviewStatus: 'pending',
          safetyFlags,
        };

        try {
          await deps.needCaseStore.save(needCase);
        } catch {
          await deps.safetyService.recordIncident({
            scope: 'need-case-save',
            severity: 'medium',
            message: 'Need Case 保存失败，用户响应未受影响。',
            relatedNeedCaseId: needCaseId,
            relatedSessionId: sessionId,
          });
          needCaseId = undefined;
        }
      }

      const responsePayload = {
        responseMode: localMatch.responseMode,
        frictionLayer,
        frictionLayerLabel: frictionLayerLabels[frictionLayer],
        recommendedAbilityType: abilityType,
        recommendedAbilityLabel: abilityTypeLabels[abilityType],
        toolDirection,
        reason,
        bridge,
        needSummary,
        categories: localMatch.responseMode === 'recommendation'
          ? categories.map(c => ({ id: c, label: needCategoryLabels[c] }))
          : [],
        resources: localMatch.responseMode === 'recommendation'
          ? resources.map(r => ({
              id: r.id, title: r.title, href: r.href,
              kind: r.kind, useFor: r.useFor, summary: r.summary,
            }))
          : [],
        recommendedTools: localMatch.responseMode === 'recommendation'
          ? localMatch.recommendedTools.map(t => ({
              id: t.id, name: t.name, tagline: t.tagline,
              useFor: t.useFor, nextStep: t.nextStep, fit: t.fit,
            }))
          : [],
        needFrame: localMatch.needFrame,
        diagnosisOptions: localMatch.responseMode === 'diagnosis' ? localMatch.diagnosisOptions : [],
        actionPlan: agentRecommendation.actionPlan,
        safety: {
          piiDetected: safetyFlags.piiDetected,
          consentForTopic: safetyFlags.consentForTopic,
          isMinorContext,
          complianceRedirected: safetyFlags.complianceRedirected,
          note: '请不要输入姓名、联系方式、API Key、公司机密等敏感信息。',
        },
      };

      return {
        needCaseId,
        sessionId,
        responsePayload,
        fallbackUsed,
      };
    },
  };
}
