/** 站内助手 SSE v2：所有帧共享稳定消息/尝试身份和消息内序号。 */
export interface AssistantStreamIds {
  version: 2;
  eventId: string;
  requestId: string;
  messageId: string;
  attemptId: string;
  runId: string | null;
  sequence: number;
}

export type AssistantStreamAccepted = AssistantStreamIds & {
  type: 'accepted';
  sequence: 0;
};

export type AssistantStreamDelta = AssistantStreamIds & {
  type: 'delta';
  delta: string;
};

export type AssistantStreamResult = {
  sessionId: string;
  answer: string;
  citations: Array<{ slug: string }>;
  aiUsedFlag: boolean;
  /** 回答未写完（模型还在生成时到了运行预算）；缺省表示完整回答。 */
  partial?: boolean;
  elapsedMs: number;
  requestId: string;
  messageId: string;
  attemptId: string;
  runId: string | null;
  conversationId: string | null;
};

export type AssistantStreamDone = AssistantStreamIds & {
  type: 'done';
  result: AssistantStreamResult;
};

export type AssistantStreamError = AssistantStreamIds & {
  type: 'error';
  code: string;
  message?: string;
};

export type AssistantStreamEvent =
  | AssistantStreamAccepted
  | AssistantStreamDelta
  | AssistantStreamDone
  | AssistantStreamError;

export function assistantStreamEventId(messageId: string, sequence: number): string {
  return `${messageId}:${sequence}`;
}

export function parseAssistantStreamEvent(value: unknown): AssistantStreamEvent | null {
  if (!isRecord(value) || value.version !== 2 ||
      typeof value.eventId !== 'string' || typeof value.requestId !== 'string' ||
      typeof value.messageId !== 'string' || typeof value.attemptId !== 'string' ||
      !(typeof value.runId === 'string' || value.runId === null) ||
      typeof value.sequence !== 'number' || !Number.isInteger(value.sequence) || value.sequence < 0 ||
      value.eventId !== assistantStreamEventId(value.messageId, value.sequence)) return null;

  const sequence = value.sequence;
  if (value.type === 'accepted' && sequence === 0) return value as unknown as AssistantStreamAccepted;
  if (value.type === 'delta' && typeof value.delta === 'string' && value.delta.length > 0 && sequence > 0) {
    return value as unknown as AssistantStreamDelta;
  }
  if (value.type === 'done' && isResult(value.result) && sequence > 0 &&
      value.result.requestId === value.requestId && value.result.messageId === value.messageId &&
      value.result.attemptId === value.attemptId && value.result.runId === value.runId) return value as unknown as AssistantStreamDone;
  if (value.type === 'error' && typeof value.code === 'string' && value.code.length > 0 &&
      (value.message === undefined || typeof value.message === 'string')) return value as unknown as AssistantStreamError;
  return null;
}

function isResult(value: unknown): value is AssistantStreamResult {
  if (!isRecord(value)) return false;
  return typeof value.sessionId === 'string' && typeof value.answer === 'string' &&
    Array.isArray(value.citations) && value.citations.every((citation) => isRecord(citation) && typeof citation.slug === 'string') &&
    typeof value.aiUsedFlag === 'boolean' && typeof value.elapsedMs === 'number' && Number.isFinite(value.elapsedMs) &&
    (value.partial === undefined || typeof value.partial === 'boolean') &&
    typeof value.requestId === 'string' && typeof value.messageId === 'string' && typeof value.attemptId === 'string' &&
    (typeof value.runId === 'string' || value.runId === null) &&
    (typeof value.conversationId === 'string' || value.conversationId === null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
