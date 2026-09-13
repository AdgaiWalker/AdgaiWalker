/**
 * useIntakeChat — 「卡」的对话编排：一问一答，原地呈现。
 *
 * 每次发送 = 一条访客消息 + 一条回答（或一条可读的错误说明，绝不假装成功）。
 * 提交走 useIntakeSubmit → `/intake`，请求与响应契约不变；
 * 最近一条结果写入会话存储，供 /tools/result 刷新还原与深链使用。
 */
import { CLUE_BODY_MIN_LENGTH, isValidClueBody } from '@walker/shared';
import { useCallback, useMemo, useState } from 'react';
import type { IntakeResult } from '../api/public-api';
import { writeIntakeResult } from '../lib/intake-result-store';
import { useIntakeSubmit } from './useIntakeSubmit';

export type IntakeChatTurn = {
  id: string;
  body: string;
  /** 失败时为 null，原因见 error */
  answer: IntakeResult | null;
  error: string | null;
};

export function useIntakeChat() {
  const { loading, submit } = useIntakeSubmit();
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<IntakeChatTurn[]>([]);

  const draftOk = useMemo(() => isValidClueBody(draft), [draft]);
  const remaining = Math.max(0, CLUE_BODY_MIN_LENGTH - draft.trim().length);

  const send = useCallback(
    async (text?: string) => {
      const raw = (text ?? draft).trim();
      if (!isValidClueBody(raw) || loading) return;

      const id = `turn-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;
      setDraft('');
      setTurns((prev) => [
        ...prev,
        { id, body: raw, answer: null, error: null },
      ]);

      const { result, error } = await submit(raw);
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === id ? { ...turn, answer: result, error } : turn,
        ),
      );

      if (result) {
        writeIntakeResult({ result, body: raw });
        return;
      }
      // 失败：内容还给输入框，方便直接重试
      setDraft((current) => (current ? current : raw));
    },
    [draft, loading, submit],
  );

  const reset = useCallback(() => {
    setTurns([]);
    setDraft('');
  }, []);

  return {
    draft,
    draftOk,
    remaining,
    minLength: CLUE_BODY_MIN_LENGTH,
    loading,
    turns,
    onDraftChange: setDraft,
    send,
    reset,
  };
}
