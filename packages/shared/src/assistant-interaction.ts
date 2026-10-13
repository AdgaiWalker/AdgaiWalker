import { isRecord } from './guards.js';
import { findPlacement } from './deployment.js';

export const ASSISTANT_INTERACTION_EVENTS = [
  'expose', 'intro-dismiss', 'open', 'close', 'send', 'follow-up', 'member-switch', 'citation-click', 'feedback',
] as const;
export type AssistantInteractionEvent = (typeof ASSISTANT_INTERACTION_EVENTS)[number];
export type AssistantInteractionFeedback = 'helpful' | 'not-helpful';

export function isAssistantInteractionEvent(value: unknown): value is AssistantInteractionEvent {
  return typeof value === 'string' && (ASSISTANT_INTERACTION_EVENTS as readonly string[]).includes(value);
}

export type AssistantInteractionInput = {
  schemaVersion: 1;
  eventId: string;
  event: AssistantInteractionEvent;
  placementKey: string;
  scopeSlug: string;
  occurredAt?: string;
  memberKey?: string;
  messageId?: string;
  targetSlug?: string;
  feedback?: AssistantInteractionFeedback;
};

const ALLOWED_KEYS = new Set([
  'schemaVersion', 'eventId', 'event', 'placementKey', 'scopeSlug', 'occurredAt',
  'memberKey', 'messageId', 'targetSlug', 'feedback',
]);

/** 严格解析面板事件；查询参数、任意 URL 和自由格式属性都不进入存储层。 */
export function parseAssistantInteraction(value: unknown): AssistantInteractionInput | null {
  if (!isRecord(value) || Object.keys(value).some((key) => !ALLOWED_KEYS.has(key))) return null;
  if (value.schemaVersion !== 1 || typeof value.eventId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(value.eventId)) return null;
  if (!isAssistantInteractionEvent(value.event)) return null;
  if (typeof value.placementKey !== 'string' || !findPlacement(value.placementKey)) return null;
  if (typeof value.scopeSlug !== 'string' || !/^[A-Za-z0-9_/-]{1,200}$/.test(value.scopeSlug)) return null;
  if (value.occurredAt !== undefined && (typeof value.occurredAt !== 'string' || value.occurredAt.length > 64 || !Number.isFinite(Date.parse(value.occurredAt)))) return null;
  if (value.memberKey !== undefined && (typeof value.memberKey !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value.memberKey))) return null;
  if (value.messageId !== undefined && (typeof value.messageId !== 'string' || !/^message-[a-f0-9]{24}$/.test(value.messageId))) return null;
  if (value.targetSlug !== undefined && (typeof value.targetSlug !== 'string' || !/^[A-Za-z0-9_/-]{1,200}$/.test(value.targetSlug))) return null;
  if (value.feedback !== undefined && value.feedback !== 'helpful' && value.feedback !== 'not-helpful') return null;

  const event = value.event as AssistantInteractionEvent;
  if (event === 'member-switch' && !value.memberKey) return null;
  if ((event === 'send' || event === 'follow-up') && !value.messageId) return null;
  if (event === 'citation-click' && (!value.messageId || !value.targetSlug)) return null;
  if (event !== 'send' && event !== 'follow-up' && event !== 'citation-click' && event !== 'feedback' && value.messageId !== undefined) return null;
  if (event !== 'citation-click' && value.targetSlug !== undefined) return null;
  if (event === 'feedback' && (!value.messageId || !value.feedback)) return null;
  if (event !== 'feedback' && value.feedback !== undefined) return null;

  return {
    schemaVersion: 1,
    eventId: value.eventId,
    event,
    placementKey: value.placementKey,
    scopeSlug: value.scopeSlug,
    ...(typeof value.occurredAt === 'string' ? { occurredAt: value.occurredAt } : {}),
    ...(typeof value.memberKey === 'string' ? { memberKey: value.memberKey } : {}),
    ...(typeof value.messageId === 'string' ? { messageId: value.messageId } : {}),
    ...(typeof value.targetSlug === 'string' ? { targetSlug: value.targetSlug } : {}),
    ...(value.feedback === 'helpful' || value.feedback === 'not-helpful' ? { feedback: value.feedback } : {}),
  };
}
