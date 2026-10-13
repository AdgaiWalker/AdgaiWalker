/**
 * useAssistant — 小影编排：消息流状态 + 流式提交（SSE 逐字）+ 停止 + 多轮 sessionId（内存态）
 */
import { extractStreamedAnswer, isValidAssistantBody, type AssistantStreamAccepted, type PublicConversationHistory } from '@walker/shared';
import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { formatApiError } from '../api/format-api-error';
import { publicApi, type AssistantRequestContext, type AssistantResult } from '../api/public-api';

export type AssistantMessage =
  | { role: 'user'; text: string; id?: string }
  | {
      role: 'assistant';
      text: string;
      citations: string[];
      aiUsedFlag: boolean;
      member?: { name: string; revision: number } | null;
      delivery?: string;
      hidden?: boolean;
      id?: string;
      /** 从已保存会话恢复，便于界面区分旧回答与本轮结果。 */
      restored?: boolean;
      /** 用户点停止后保留已收文字 */
      stopped?: boolean;
      /** 模型还在生成时到了运行预算：这条是真回答，只是没写完 */
      partial?: boolean;
    };

type AssistantContext = Pick<AssistantRequestContext, 'placementKey' | 'scopeSlug' | 'memberKey' | 'deploymentGeneration'> & {
  member?: { name: string; revision: number } | null;
};

type SetMessages = Dispatch<SetStateAction<AssistantMessage[]>>;

function createDeltaHandler(setMessages: SetMessages): (delta: string) => void {
  let buffer = '';
  return (delta) => {
    buffer += delta;
    const visible = extractStreamedAnswer(buffer) || buffer;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'assistant') return prev;
      return [...prev.slice(0, -1), { ...last, text: visible }];
    });
  };
}

function createAcceptedHandler(options: {
  context?: AssistantContext;
  hadMessages: boolean;
  setMessages: SetMessages;
  setActiveMessageId: Dispatch<SetStateAction<string | null>>;
}): (event: AssistantStreamAccepted) => void {
  const { context, hadMessages, setMessages, setActiveMessageId } = options;
  return (event) => {
    setActiveMessageId(event.messageId);
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'assistant') return prev;
      return [...prev.slice(0, -1), { ...last, id: event.messageId }];
    });
    if (context?.placementKey && context.scopeSlug) {
      void publicApi.assistantInteraction({
        schemaVersion: 1,
        eventId: globalThis.crypto.randomUUID(),
        event: hadMessages ? 'follow-up' : 'send',
        placementKey: context.placementKey,
        scopeSlug: context.scopeSlug,
        messageId: event.messageId,
        occurredAt: new Date().toISOString(),
        ...(context.memberKey ? { memberKey: context.memberKey } : {}),
      }).catch(() => undefined);
    }
  };
}

/** 消息里流式中的助手占位（渲染层区分逐字更新） */
export type StreamingMessage = { streaming: true };

export function useAssistant(context?: AssistantContext) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationConflict, setGenerationConflict] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [stopPending, setStopPending] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
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

  const patchAssistantById = useCallback((
    messageId: string,
    patch: (message: Extract<AssistantMessage, { role: 'assistant' }>) => Extract<AssistantMessage, { role: 'assistant' }>,
  ) => setMessages((prev) => prev.map((message) =>
    message.role === 'assistant' && message.id === messageId ? patch(message) : message,
  )), []);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!isValidAssistantBody(text) || loading) return;
    setLoading(true);
    setStreaming(true);
    setError(null);
    setGenerationConflict(false);
    setActiveMessageId(null);
    setStopPending(false);
    const member = context?.member ?? null;
    const requestKey = globalThis.crypto.randomUUID();
    appendUser(text);
    // 助手占位：空文本，流式逐字填充
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', text: '', citations: [], aiUsedFlag: false, member },
    ]);
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const done: AssistantResult = await publicApi.assistantStream({
        body: text,
        sessionId: sessionIdRef.current,
        onText: createDeltaHandler(setMessages),
        signal: ac.signal,
        source: 'assistant-stream',
        context: {
          placementKey: context?.placementKey,
          scopeSlug: context?.scopeSlug,
          memberKey: context?.memberKey,
          deploymentGeneration: context?.deploymentGeneration,
          conversationId: conversationIdRef.current,
          requestKey,
        },
        onAccepted: createAcceptedHandler({ context, hadMessages: messages.length > 0, setMessages, setActiveMessageId }),
      });
      sessionIdRef.current = done.sessionId;
      conversationIdRef.current = done.conversationId;
      patchLastAssistant(() => ({
        role: 'assistant',
        text: done.answer,
        citations: done.citations.map((c) => c.slug),
        aiUsedFlag: done.aiUsedFlag,
        member: done.aiUsedFlag ? member : null,
        ...(done.partial ? { partial: true } : {}),
        delivery: 'sent',
        id: done.messageId,
      }));
    } catch (e) {
      const code = typeof e === 'object' && e !== null && 'code' in e ? e.code : null;
      if (code === 'user-stopped') {
        patchLastAssistant((m) => ({ ...m, stopped: true, delivery: 'partial' }));
      } else if (ac.signal.aborted) {
        patchLastAssistant((m) => ({
          ...m,
          stopped: true,
          aiUsedFlag: m.text.length > 0,
        }));
      } else {
        const conflict = code === 'placement-generation-conflict' || code === 'placement-member-unavailable';
        setGenerationConflict(conflict);
        setError(conflict ? '这个页面的公开助手已更新，请确认最新成员后再试。' : formatApiError(e));
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
  }, [context, loading, messages.length]);

  const stop = useCallback(async () => {
    if (!context?.placementKey || !context.scopeSlug) {
      abortRef.current?.abort();
      return;
    }
    if (!activeMessageId || stopPending) return;
    setStopPending(true);
    try {
      const deadline = Date.now() + 10_000;
      let status = await publicApi.stopAssistant(context.placementKey, context.scopeSlug, activeMessageId);
      while (!status.confirmed && status.state === 'PENDING' && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        status = await publicApi.stopAssistant(context.placementKey, context.scopeSlug, activeMessageId);
      }
      if (status.state === 'CANCELLED' && status.confirmed) {
        patchAssistantById(activeMessageId, (message) => ({ ...message, stopped: true, delivery: 'partial' }));
        abortRef.current?.abort();
      } else if (status.state === 'UNKNOWN') {
        setError('系统尚未确认运行已停止，当前仍在隔离核对。');
      } else if (status.state === 'PENDING') {
        setError('仍在等待运行状态确认；系统尚未报告已停止。');
      } else if (status.state === 'FAILED') {
        setError('运行已结束，但不是用户取消。');
      }
    } catch {
      setError('无法确认助手是否停止；页面断开不会当作已停止。');
    } finally {
      setStopPending(false);
    }
  }, [activeMessageId, context, stopPending, patchAssistantById]);

  const restoreHistory = useCallback((history: PublicConversationHistory) => {
    conversationIdRef.current = history.conversationId;
    sessionIdRef.current = null;
    setMessages(history.messages.map((message): AssistantMessage => message.role === 'visitor'
      ? { role: 'user', id: message.id, text: message.text }
      : {
          role: 'assistant',
          id: message.id,
          text: message.text,
          citations: [],
          aiUsedFlag: message.member !== null,
          member: message.member,
          delivery: message.delivery,
          hidden: message.hidden,
          stopped: message.stopped,
          restored: true,
        }));
    setError(null);
    setGenerationConflict(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    sessionIdRef.current = null;
    conversationIdRef.current = null;
    setActiveMessageId(null);
    setMessages([]);
    setError(null);
  }, []);

  return { messages, loading, streaming, error, generationConflict, activeMessageId, stopPending, send, stop, reset, restoreHistory };
}
