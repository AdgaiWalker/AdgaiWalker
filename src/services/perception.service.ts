/**
 * Perception 服务 — Agent 六模块之"感知与输入"
 *
 * 职责：消息截断、逐条 PII 脱敏与压缩、最新需求提取、未成年人场景标记。
 * 不做工具推荐、不写持久化、不调 LLM（见 agent-six-modules-architecture）。
 */

import { compactText, isMinorAudience, redactSensitiveText } from '@/agent/privacy';

import type { PerceptionServicePort, PerceivedInput } from './interfaces';

/** 保留最近的消息轮数（与 HTTP 层校验上限对齐） */
const MAX_MESSAGES = 16;
/** 单条消息压缩上限 */
const MAX_MESSAGE_LENGTH = 500;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function findLatestUserNeed(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return '';
}

export function createPerceptionService(): PerceptionServicePort {
  return {
    perceive({ messages, audienceGroup }): PerceivedInput {
      const cleanedMessages = messages.slice(-MAX_MESSAGES).map((m) => ({
        role: m.role,
        content: redactSensitiveText(compactText(m.content, MAX_MESSAGE_LENGTH)).text,
      }));

      const latestRaw = findLatestUserNeed(messages);
      const latestNeedRedacted = redactSensitiveText(compactText(latestRaw, MAX_MESSAGE_LENGTH));

      return {
        messages: cleanedMessages,
        latestNeedRedacted,
        isMinorContext: isMinorAudience(audienceGroup),
      };
    },
  };
}
