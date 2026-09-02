/**
 * 公开站 API 门面：页/hooks 只依赖本模块，不直接拼 fetch。
 */
import type { ContentFeedbackSignal } from '../shared/content-feedback';
import { publicRequest } from './http';

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
