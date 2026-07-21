/**
 * useIntake — 卡口编排：校验提示 + 门面提交
 */
import { isValidClueBody, CLUE_BODY_MIN_LENGTH } from '@walker/shared';
import { useCallback, useMemo, useState } from 'react';
import { formatApiError } from '../api/format-api-error';
import { publicApi, type IntakeResult } from '../api/public-api';

export function useIntake() {
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IntakeResult | null>(null);

  const bodyOk = useMemo(() => isValidClueBody(body), [body]);
  const remaining = Math.max(0, CLUE_BODY_MIN_LENGTH - body.trim().length);

  const submit = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await publicApi.intake(body);
      setResult(data);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [body]);

  return {
    body,
    bodyOk,
    remaining,
    minLength: CLUE_BODY_MIN_LENGTH,
    loading,
    error,
    result,
    onBodyChange: setBody,
    onPickExample: setBody,
    onSubmit: () => {
      void submit();
    },
  };
}
