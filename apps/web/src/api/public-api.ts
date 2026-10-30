/**
 * 公开站 API 门面：页/hooks 只依赖本模块，不直接拼 fetch。
 */
import type { ContentFeedbackSignal } from '../shared/content-feedback';
import { parseAssistantStreamEvent, type AssistantInteractionInput, type AssistantStreamAccepted, type AssistantStreamResult, type PublicAssistantStopStatus, type PublicConversationHistory, type PublicPlacementManifest } from '@walker/shared';
import { publicRequest } from './http';
import { ApiError } from './http';

export type { ContentFeedbackSignal };

export interface IntakeResult {
  clueId: string;
  nextStep: string;
  bucketId: string;
  aiUsedFlag: boolean;
  /** AI 策略附带的可引用文章推荐（规则版为 null） */
  suggestedSlug?: string | null;
  suggestedTitle?: string | null;
  poolStatus: string;
}

export interface IntakePublicConfig {
  guestQuota: number;
  quotaMinLength: number;
  rateLimit: number;
  rateWindowMinutes: number;
}

export interface LikeResult {
  path: string;
  count: number;
}

export interface AssistantCitationView {
  slug: string;
}

export interface AssistantResult extends AssistantStreamResult {}

export type AssistantRequestContext = {
  placementKey?: string;
  scopeSlug?: string;
  conversationId?: string | null;
  requestKey?: string;
  memberKey?: string | null;
  deploymentGeneration?: number | null;
};

export type AssistantStreamOptions = {
  body: string;
  sessionId: string | null;
  onText: (delta: string) => void;
  signal?: AbortSignal;
  source?: string;
  context?: AssistantRequestContext;
  onAccepted?: (event: AssistantStreamAccepted) => void;
};

const ACK_MAX_ATTEMPTS = 5;
const ACK_RETRY_BASE_DELAY_MS = 40;

async function acknowledgeWhenSent(messageId: string): Promise<void> {
  for (let attempt = 0; attempt < ACK_MAX_ATTEMPTS; attempt += 1) {
    try {
      await publicApi.acknowledgeMessage(messageId);
      return;
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'assistant-message-not-sent' || attempt === ACK_MAX_ATTEMPTS - 1) return;
      // The SSE body can reach the browser before the server's response-finish
      // callback marks the message sent. Retry only this narrow race.
      await new Promise((resolve) => setTimeout(resolve, ACK_RETRY_BASE_DELAY_MS * (attempt + 1)));
    }
  }
}

export const publicApi = {
  assistantPlacement(placementKey: string, scopeSlug: string): Promise<PublicPlacementManifest> {
    return publicRequest<PublicPlacementManifest>(
      `/assistant/placements/${encodeURIComponent(placementKey)}/${encodeURIComponent(scopeSlug)}`,
    );
  },

  assistantHistory(placementKey: string, scopeSlug: string): Promise<PublicConversationHistory> {
    return publicRequest<PublicConversationHistory>(
      `/assistant/conversations/${encodeURIComponent(placementKey)}/${encodeURIComponent(scopeSlug)}`,
    );
  },

  assistantInteraction(input: AssistantInteractionInput): Promise<{ recorded: boolean; duplicate: boolean }> {
    return publicRequest('/assistant/events', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  stopAssistant(placementKey: string, scopeSlug: string, messageId: string): Promise<PublicAssistantStopStatus> {
    return publicRequest<PublicAssistantStopStatus>(
      `/assistant/conversations/${encodeURIComponent(placementKey)}/${encodeURIComponent(scopeSlug)}/stop`,
      { method: 'POST', body: JSON.stringify({ messageId }) },
    );
  },

  intake(body: string, source = 'tools-visitor'): Promise<IntakeResult> {
    return publicRequest<IntakeResult>('/intake', {
      method: 'POST',
      body: JSON.stringify({ body, source }),
    });
  },

  intakeConfig(): Promise<IntakePublicConfig> {
    return publicRequest<IntakePublicConfig>('/intake/config');
  },

  assistant(
    body: string,
    sessionId?: string | null,
    source = 'assistant-panel',
  ): Promise<AssistantResult> {
    return publicRequest<AssistantResult>('/assistant', {
      method: 'POST',
      body: JSON.stringify({ body, sessionId: sessionId ?? null, source }),
    }).then(async (result) => {
      if (result.conversationId) await acknowledgeWhenSent(result.messageId);
      return result;
    });
  },

  acknowledgeMessage(messageId: string): Promise<{ acknowledged: boolean; duplicate: boolean }> {
    return publicRequest(`/assistant/messages/${encodeURIComponent(messageId)}/ack`, { method: 'POST' });
  },

  /** 流式问答（SSE）：onText 增量回调；返回 done 终值；abort 信号支持停止。
   *  自包含 fetch（不走 publicRequest）——流式路径不依赖 JSON 门面的模块实例，dev/prod 行为一致。 */
  async assistantStream({
    body, sessionId, onText, signal, source = 'assistant-stream', context, onAccepted,
  }: AssistantStreamOptions): Promise<AssistantResult> {
    const res = await fetch('/api/assistant/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ body, sessionId, source, ...context }),
      signal,
    });
    if (!res.ok || !res.body) throw new ApiError(`http-${res.status}`);
    const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done: AssistantResult | null = null;
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE 帧以空行分隔；event: X + data: {...}
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const eventLine = frame
            .split('\n')
            .find((l) => l.startsWith('event: '));
          const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          const payload = JSON.parse(dataLine.slice(6)) as unknown;
          const kind = eventLine?.slice(7);
          const event = parseAssistantStreamEvent(payload);
          if (!event || kind !== event.type) throw new Error('assistant-stream-invalid-frame');
          if (event.type === 'accepted') onAccepted?.(event);
          else if (event.type === 'delta') onText(event.delta);
          else if (event.type === 'done') done = event.result;
          else if (event.type === 'error') throw new ApiError(event.code, event.message);
        }
      }
      if (!done) throw new Error('stream-closed-without-done');
      if (done.conversationId) await acknowledgeWhenSent(done.messageId);
      return done;
  },

  getLikeCount(path: string): Promise<LikeResult> {
    return publicRequest<LikeResult>(
      `/likes?path=${encodeURIComponent(path)}`,
    );
  },

  like(path: string): Promise<LikeResult> {
    return publicRequest<LikeResult>('/likes', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  },

  contentFeedback(input: {
    contentId: string;
    signal: ContentFeedbackSignal;
    note?: string;
  }): Promise<{ id: string; contentId: string; signal: string }> {
    return publicRequest('/content-feedback', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  searchMiss(query: string): Promise<{ ok: true }> {
    return publicRequest('/search-events', {
      method: 'POST',
      body: JSON.stringify({ query, hadResults: false }),
    });
  },
};
