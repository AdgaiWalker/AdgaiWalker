import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { ApiError } from '../api/http';
import { publicApi } from '../api/public-api';
import { explainErrorCode } from '../shared/rules-ui';

export function LikeButton({ path }: { path: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void publicApi
      .getLikeCount(path)
      .then((d) => setCount(d.count))
      .catch(() => setCount(0));
  }, [path]);

  async function like() {
    setBusy(true);
    setErr(null);
    try {
      const data = await publicApi.like(path);
      setCount(data.count);
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(explainErrorCode(e.code, e.message));
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn-ghost" disabled={busy} onClick={() => void like()}>
        <Heart size={15} />
        赞 {count === null ? '…' : count}
      </button>
      {err ? <span className="meta"> · {err}</span> : null}
    </div>
  );
}
