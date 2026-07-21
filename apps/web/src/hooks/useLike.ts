/**
 * useLike — 页/容器侧：点赞门面编排（非 UI）
 */
import { useCallback, useEffect, useState } from 'react';
import { formatApiError } from '../api/format-api-error';
import { publicApi } from '../api/public-api';

export function useLike(path: string) {
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCount(null);
    setError(null);
    void publicApi
      .getLikeCount(path)
      .then((d) => {
        if (!cancelled) setCount(d.count);
      })
      .catch(() => {
        if (!cancelled) {
          setCount(null);
          setError('暂无法读取点赞');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const onLike = useCallback(() => {
    setBusy(true);
    setError(null);
    void publicApi
      .like(path)
      .then((data) => setCount(data.count))
      .catch((e: unknown) => {
        setError(formatApiError(e));
      })
      .finally(() => setBusy(false));
  }, [path]);

  return { count, busy, error, onLike };
}
