/**
 * useIntake — 卡口编排：校验提示 + 门面提交
 */
import { isValidClueBody, CLUE_BODY_MIN_LENGTH } from '@walker/shared';
import { useCallback, useMemo, useState } from 'react';
import { ApiError } from '../api/http';
import { publicApi, type IntakeResult } from '../api/public-api';
import { explainErrorCode } from '../shared/rules-ui';

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
      if (e instanceof ApiError) {
        setError(explainErrorCode(e.code, e.message));
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
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
