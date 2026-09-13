/**
 * useIntakeSubmit — 卡口提交：调 `/intake` 并把「结果 / 可读错误」交回调用方。
 *
 * 展示层（对话流）自己决定每条消息怎么呈现，所以这里不持有结果状态，
 * 只负责 loading 与错误翻译，避免又养一份会被覆盖的 result/error。
 */
import { useCallback, useState } from 'react';
import { formatApiError } from '../api/format-api-error';
import { publicApi, type IntakeResult } from '../api/public-api';

/** 失败时 result 为 null 且带上可读原因（调用方挂到对应消息上） */
export type IntakeSubmitOutcome = {
  result: IntakeResult | null;
  error: string | null;
};

export function useIntakeSubmit() {
  const [loading, setLoading] = useState(false);

  const submit = useCallback(
    async (raw: string): Promise<IntakeSubmitOutcome> => {
      setLoading(true);
      try {
        const result = await publicApi.intake(raw);
        return { result, error: null };
      } catch (e) {
        return { result: null, error: formatApiError(e) };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, submit };
}
