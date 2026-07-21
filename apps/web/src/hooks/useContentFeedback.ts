/**
 * useContentFeedback — 页/容器侧：内容反馈门面编排
 */
import { useCallback, useState } from 'react';
import { ApiError } from '../api/http';
import { publicApi } from '../api/public-api';
import type { ContentFeedbackSignal } from '../shared/content-feedback';
import { explainErrorCode } from '../shared/rules-ui';

export function useContentFeedback(contentId: string) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [pendingSignal, setPendingSignal] =
    useState<ContentFeedbackSignal | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (sig: ContentFeedbackSignal, noteText: string) => {
      setBusy(true);
      setError(null);
      try {
        await publicApi.contentFeedback({
          contentId,
          signal: sig,
          note: sig === 'useful' ? undefined : noteText,
        });
        setDone(true);
      } catch (e) {
        if (e instanceof ApiError) {
          setError(explainErrorCode(e.code, e.message));
        } else {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setBusy(false);
      }
    },
    [contentId],
  );

  const onSelectUseful = useCallback(() => {
    void submit('useful', '');
  }, [submit]);

  const onSelectNeedsMore = useCallback(() => {
    setPendingSignal('needs-more');
  }, []);

  const onSelectOutdated = useCallback(() => {
    setPendingSignal('outdated');
  }, []);

  const onSubmitPending = useCallback(() => {
    if (!pendingSignal || pendingSignal === 'useful') return;
    void submit(pendingSignal, note);
  }, [note, pendingSignal, submit]);

  return {
    done,
    error,
    note,
    pendingSignal,
    busy,
    onSelectUseful,
    onSelectNeedsMore,
    onSelectOutdated,
    onNoteChange: setNote,
    onSubmitPending,
  };
}
