import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi, type Execution } from '../api/admin-api';
import { labelExecutionStatus, labelOutcome } from '../shared/labels';

function defaultDeliveryUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.protocol}//${window.location.hostname}:5173/posts`;
}

export function ExecutionsPage() {
  const [list, setList] = useState<Execution[]>([]);
  const [url, setUrl] = useState(defaultDeliveryUrl);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await adminApi.executions());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = useMemo(
    () => list.filter((ex) => ex.outcome == null).length,
    [list],
  );

  return (
    <div>
      <h1>执行 / 检验</h1>
      <p className="muted">待检验 {openCount} · 共 {list.length}</p>
      {err ? <p className="error">{err}</p> : null}
      {msg ? <p className="muted">{msg}</p> : null}
      <div className="panel">
        <label>交付 URL</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      {list.map((ex) => (
        <div className="panel" key={ex.id}>
          <div>
            {ex.id.slice(0, 12)}… · 题苗 {ex.seedId.slice(0, 8)} ·{' '}
            {labelExecutionStatus(ex.status)} · {labelOutcome(ex.outcome)}
          </div>
          <div className="muted">{ex.deliveryUrl ?? '未交付'}</div>
          <button
            type="button"
            onClick={async () => {
              try {
                await adminApi.deliver(ex.id, url);
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
                const r = await adminApi.review(ex.id, 'yes');
                setMsg(`检验有用 · 可计数=${String(r.countable)}`);
                await load();
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            检验有用
          </button>
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              try {
                const r = await adminApi.review(ex.id, 'no', '未达预期需重做');
                setMsg(`检验没用 · 可计数=${String(r.countable)}`);
                await load();
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            检验没用
          </button>
        </div>
      ))}
    </div>
  );
}
