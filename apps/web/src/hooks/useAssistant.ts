/**
 * useAssistant — 站内助手编排：消息流状态 + 门面提交 + 多轮 sessionId（内存态）
 */
import { isValidClueBody } from '@walker/shared';
import { useCallback, useRef, useState } from 'react';
import { formatApiError } from '../api/format-api-error';
import { publicApi, type AssistantResult } from '../api/public-api';

export type AssistantMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; citations: string[]; aiUsedFlag: boolean };

export function useAssistant() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!isValidClueBody(text) || loading) return;
    setLoading(true);
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', text }]);
    try {
      const data: AssistantResult = await publicApi.assistant(
        text,
        sessionIdRef.current,
      );
      sessionIdRef.current = data.sessionId;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.answer,
          citations: data.citations.map((c) => c.slug),
          aiUsedFlag: data.aiUsedFlag,
        },
      ]);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const reset = useCallback(() => {
    sessionIdRef.current = null;
    setMessages([]);
    setError(null);
  }, []);

  return { messages, loading, error, send, reset };
}
