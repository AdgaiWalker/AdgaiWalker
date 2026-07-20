import { useCallback, useEffect, useState } from 'react';
import { api, type Execution } from '../api';

export function ExecutionsPage() {
  const [list, setList] = useState<Execution[]>([]);
  const [url, setUrl] = useState('https://iwalk.pro/posts/demo');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api.executions());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1>执行 / 检验</h1>
      {err ? <p className="error">{err}</p> : null}
      {msg ? <p className="muted">{msg}</p> : null}
      <div className="panel">
        <label>交付 URL（热记）</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      {list.map((ex) => (
        <div className="panel" key={ex.id}>
          <div>
            {ex.id.slice(0, 12)}… · seed {ex.seedId.slice(0, 8)} · {ex.status} ·{' '}
            {ex.outcome ?? '未检'}
          </div>
          <div className="muted">{ex.deliveryUrl ?? '未交付'}</div>
          <button
            type="button"
            onClick={async () => {
              try {
                await api.deliver(ex.id, url);
                await load();
                setMsg('已交付');
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            交付
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                const r = await api.review(ex.id, 'yes');
                setMsg(`检验 yes · countable=${String(r.countable)}`);
                await load();
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            检验 yes
          </button>
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              try {
                const r = await api.review(ex.id, 'no', '未达预期需重做');
                setMsg(`检验 no · countable=${String(r.countable)}`);
                await load();
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            检验 no
          </button>
        </div>
      ))}
    </div>
  );
}
