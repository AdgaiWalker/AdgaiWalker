/**
 * VersionDriftNotice — 兜底更新组件：仅在用户切回标签页且线上 /version.json 变化时浮现轻提示。
 */
import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { getWebBuildVersion } from '../../lib/web-telemetry';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function VersionDriftNotice() {
  const [nextVersion, setNextVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const current = getWebBuildVersion();
    if (!current || current === 'dev' || import.meta.env.MODE === 'test') return;

    let lastCheck = Date.now();
    let cancelled = false;

    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastCheck < CHECK_INTERVAL_MS) return;
      lastCheck = now;
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        if (!cancelled && data.version && data.version !== current) {
          setNextVersion(data.version);
          setDismissed(false);
        }
      } catch {
        /* 离线或网络抖动静默忽略 */
      }
    };

    const onVisible = () => {
      void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!nextVersion || dismissed) return null;

  return (
    <div className="version-drift-pill" role="status" aria-live="polite">
      <button
        type="button"
        className="version-drift-refresh"
        onClick={() => window.location.reload()}
      >
        <RefreshCw size={13} aria-hidden />
        <span>发现新内容 · 刷新</span>
      </button>
      <button
        type="button"
        className="version-drift-close"
        aria-label="忽略更新提示"
        onClick={() => setDismissed(true)}
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}
