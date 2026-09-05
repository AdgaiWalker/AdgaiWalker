/**
 * 公开站 API 门面：页/hooks 只依赖本模块，不直接拼 fetch。
 */
import type { ContentFeedbackSignal } from '../shared/content-feedback';
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

export interface LikeResult {
  path: string;
  count: number;
}

export interface AssistantCitationView {
  slug: string;
}

export interface AssistantResult {
  sessionId: string;
  answer: string;
  citations: AssistantCitationView[];
  aiUsedFlag: boolean;
  elapsedMs: number;
}

export const publicApi = {
  intake(body: string, source = 'tools-visitor'): Promise<IntakeResult> {
    return publicRequest<IntakeResult>('/intake', {
      method: 'POST',
      body: JSON.stringify({ body, source }),
    });
  },

  assistant(
    body: string,
    sessionId?: string | null,
    source = 'assistant-panel',
  ): Promise<AssistantResult> {
    return publicRequest<AssistantResult>('/assistant', {
      method: 'POST',
      body: JSON.stringify({ body, sessionId: sessionId ?? null, source }),
    });
  },

  /** 流式问答（SSE）：onText 增量回调；返回 done 终值；abort 信号支持停止。
   *  自包含 fetch（不走 publicRequest）——流式路径不依赖 JSON 门面的模块实例，dev/prod 行为一致。 */
  async assistantStream(
    body: string,
    sessionId: string | null,
    onText: (delta: string) => void,
    signal?: AbortSignal,
    source = 'assistant-stream',
  ): Promise<AssistantResult> {
    const res = await fetch('/api/assistant/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ body, sessionId, source }),
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
          const payload = JSON.parse(dataLine.slice(6));
          const kind = eventLine?.slice(7);
          if (kind === 'text' && payload.delta) onText(payload.delta);
          else if (kind === 'done') done = payload as AssistantResult;
          else if (kind === 'error') throw new Error(payload.message);
        }
      }
      if (!done) throw new Error('stream-closed-without-done');
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
