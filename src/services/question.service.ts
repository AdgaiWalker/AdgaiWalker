/**
 * 提问处理服务 — 用户提问 + 会话关联
 *
 * 将 /api/match.ts 中的业务编排逻辑拆出：
 * 清洗消息 -> 匹配 -> 调用模型 -> 持久化。
 * HTTP 相关逻辑（速率限制、请求解析、响应格式化）留在 API 层。
 */

import { randomUUID } from 'node:crypto';

import { compactText, redactSensitiveText, isMinorAudience } from '@/agent/privacy';
import { callGateway } from '@/agent/gateway';
import { matchSiteResources } from '@/agent/match';
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
import { createSessionId, saveConversationMessages, incrementMatchStats } from '@/conversation/store';

import type { QuestionServicePort, QuestionResult } from './interfaces';
import type { DemandEventRepositoryPort, MatchSessionRepositoryPort, MatchSession, DemandEvent } from '@/stores/ports';

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
  // 从 matchResources 查找
  const { matchResources } = require('@/profiles/resource-index');
  const picked = ids
    .map(id => matchResources.find((r: MatchResource) => r.id === id))
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

export function createQuestionService(deps: {
  sessionStore: MatchSessionRepositoryPort;
  eventStore: DemandEventRepositoryPort;
}): QuestionServicePort {
  return {
    async handleQuestion(input) {
      const isMinorContext = isMinorAudience(input.audienceGroup);
      const clean = cleanMessages(input.messages);
      const latestNeed = [...input.messages].reverse().find(m => m.role === 'user')?.content ?? '';
      const redacted = redactSensitiveText(compactText(latestNeed, MAX_MESSAGE_LENGTH));

      const localMatch = matchSiteResources({
        need: redacted.text,
        audienceGroup: input.audienceGroup as AudienceGroup,
        aiStage: input.aiStage as AiStage,
      });

      let modelChoice: ModelChoice | null = null;
      if (localMatch.responseMode === 'recommendation' && localMatch.recommendedTools.length === 0) {
        modelChoice = await askModel({
          messages: clean,
          localBridge: localMatch.bridge,
          localResourceIds: localMatch.resources.map(r => r.id),
          audienceGroup: input.audienceGroup as AudienceGroup,
          aiStage: input.aiStage as AiStage,
        });
      }

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

      const now = new Date().toISOString();
      const sessionId = input.sessionId || createSessionId();
      const session: MatchSession = {
        sessionId,
        startedAt: now,
        lastActiveAt: now,
        sourcePage: input.sourcePage ?? '/tools',
        messageCount: input.messages.filter(m => m.role === 'user').length,
        consentForTopic: input.consentForTopic !== false,
        audienceGroup: input.audienceGroup as AudienceGroup,
        aiStage: input.aiStage as AiStage,
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

      let eventId: string | undefined;
      if (session.consentForTopic && (localMatch.responseMode === 'recommendation' || localMatch.responseMode === 'compliance')) {
        const event: DemandEvent = {
          eventId: randomUUID(),
          sessionId,
          createdAt: now,
          rawNeedRedacted: isMinorContext ? '[青少年/未成年场景不保存原始问题]' : redacted.text,
          needSummary,
          needCategories: categories,
          frictionLayer,
          recommendedAbilityType: abilityType,
          toolDirection,
          complianceRedirected: localMatch.complianceRedirected || frictionLayer === 'compliance-entry',
          codeAgentMisuseLikely: localMatch.codeAgentMisuseLikely,
          audienceGroup: input.audienceGroup as AudienceGroup,
          aiStage: input.aiStage as AiStage,
          isMinorContext,
          recommendedContentIds: resources.map(r => r.id),
          piiDetected: redacted.piiDetected,
          piiRemoved: redacted.piiDetected,
          status: 'pending',
        };
        await deps.eventStore.save(event);
        eventId = event.eventId;
      }

      return {
        eventId,
        sessionId,
        remaining: 0,
        responsePayload: {
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
          safety: {
            piiDetected: redacted.piiDetected,
            consentForTopic: session.consentForTopic,
            isMinorContext,
            complianceRedirected: localMatch.complianceRedirected || frictionLayer === 'compliance-entry',
            note: '请不要输入姓名、联系方式、API Key、公司机密等敏感信息。',
          },
        },
      };
    },
  };
}
