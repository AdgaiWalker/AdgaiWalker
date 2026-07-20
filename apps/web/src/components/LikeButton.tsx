import { useEffect, useState } from 'react';

export function LikeButton({ path }: { path: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/likes?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d: { count?: number }) => setCount(d.count ?? 0))
      .catch(() => setCount(0));
  }, [path]);

  async function like() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = (await res.json()) as { count?: number; code?: string };
      if (!res.ok) {
        setErr(data.code ?? res.statusText);
        return;
      }
      setCount(data.count ?? 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn-primary" disabled={busy} onClick={() => void like()}>
        赞 {count === null ? '…' : count}
      </button>
      {err ? <span className="meta"> · {err}</span> : null}
    </div>
  );
}
