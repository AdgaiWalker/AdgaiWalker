/**
 * useAssistant — 小影编排：消息流状态 + 流式提交（SSE 逐字）+ 停止 + 多轮 sessionId（内存态）
 */
import { isValidAssistantBody } from '@walker/shared';
import { useCallback, useRef, useState } from 'react';
import { formatApiError } from '../api/format-api-error';
import { publicApi, type AssistantResult } from '../api/public-api';

export type AssistantMessage =
  | { role: 'user'; text: string }
  | {
      role: 'assistant';
      text: string;
      citations: string[];
      aiUsedFlag: boolean;
      /** 用户点停止后保留已收文字 */
      stopped?: boolean;
    };

/** 消息里流式中的助手占位（渲染层区分逐字更新） */
export type StreamingMessage = { streaming: true };

/**
 * 增量提取模型 JSON 输出中 answer 字段已闭合的文本。
 * 模型按合同输出 {"answer":"…","citations":[…]}；text-delta 流的是 JSON 原文，
 * 直接显示会带 {"answer":" 等噪声——本函数把缓冲区裁剪成纯答案文本。
 * done 终值仍会整体覆盖（已过网关校验），此处只为流式期间的干净显示。
 */
export function extractAnswerText(buffer: string): string {
  const key = '"answer":"';
  const start = buffer.indexOf(key);
  if (start < 0) return '';
  let i = start + key.length;
  let out = '';
  while (i < buffer.length) {
    const ch = buffer[i];
    if (ch === '\\' && i + 1 < buffer.length) {
      const next = buffer[i + 1];
      if (next === 'n') out += '\n';
      else if (next === '"') out += '"';
      else if (next === '\\') out += '\\';
      else out += ch + next;
      i += 2;
      continue;
    }
    if (ch === '"') break; // answer 值闭合
    out += ch;
    i += 1;
  }
  return out;
}

export function useAssistant() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const appendUser = (text: string) =>
    setMessages((prev) => [...prev, { role: 'user', text }]);

  const patchLastAssistant = (
    patch: (m: Extract<AssistantMessage, { role: 'assistant' }>) => Extract<AssistantMessage, { role: 'assistant' }>,
  ) =>
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'assistant') return prev;
      return [...prev.slice(0, -1), patch(last)];
    });

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!isValidAssistantBody(text) || loading) return;
    setLoading(true);
    setStreaming(true);
    setError(null);
    appendUser(text);
    // 助手占位：空文本，流式逐字填充
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', text: '', citations: [], aiUsedFlag: false },
    ]);
    const ac = new AbortController();
    abortRef.current = ac;
    let streamBuffer = '';
    try {
      const done: AssistantResult = await publicApi.assistantStream(
        text,
        sessionIdRef.current,
        (delta) => {
          streamBuffer += delta;
          const visible = extractAnswerText(streamBuffer);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'assistant') return prev;
            return [...prev.slice(0, -1), { ...last, text: visible }];
          });
        },
        ac.signal,
      );
      sessionIdRef.current = done.sessionId;
      patchLastAssistant(() => ({
        role: 'assistant',
        text: done.answer,
        citations: done.citations.map((c) => c.slug),
        aiUsedFlag: done.aiUsedFlag,
      }));
    } catch (e) {
      if (ac.signal.aborted) {
        patchLastAssistant((m) => ({
          ...m,
          stopped: true,
          aiUsedFlag: m.text.length > 0,
        }));
      } else {
        setError(formatApiError(e));
        // 出错时移除空占位，避免残留空气泡
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && !last.text) return prev.slice(0, -1);
          return prev;
        });
      }
    } finally {
      setLoading(false);
      setStreaming(false);
      abortRef.current = null;
    }
  }, [loading]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    sessionIdRef.current = null;
    setMessages([]);
    setError(null);
  }, []);

  return { messages, loading, streaming, error, send, stop, reset };
}
