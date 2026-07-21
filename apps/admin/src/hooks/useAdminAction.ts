/**
 * useAdminAction — 管理页统一异步操作与错误展示
 * 依赖：react
 * 被调用：CluesPage / SeedsPage / ExecutionsPage
 */
import { useCallback, useState } from 'react';

export function formatAdminError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useAdminAction() {
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<void>): Promise<boolean> => {
    try {
      await fn();
      setErr(null);
      return true;
    } catch (e) {
      setErr(formatAdminError(e));
      return false;
    }
  }, []);

  return { err, setErr, run };
}
