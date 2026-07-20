import { useEffect, useState } from 'react';
import { api, type Metrics } from '../api';

export function MetricsPage() {
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void api
      .metrics()
      .then(setM)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  if (err) return <p className="error">{err}</p>;
  if (!m) return <p className="muted">加载中…</p>;

  const fails = Object.entries(m.features.failCodes).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <h1>指标 / 冷热</h1>
      <div className="panel">
        <p>线索 {m.clues} · 题苗 {m.seeds} · 执行 {m.executions}</p>
        <p>
          可计数闭环 {m.countableLoops} · yes {m.yesCount} · 外部闭环{' '}
          {m.externalLoopCount}
        </p>
      </div>
      <div className="panel">
        <h3>功能事件（近 7 日）</h3>
        <table>
          <thead>
            <tr>
              <th>feature</th>
              <th>attempt</th>
              <th>success</th>
              <th>fail</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(m.features.byFeature).map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{v.attempt}</td>
                <td>{v.success}</td>
                <td>{v.fail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h3>失败码 Top</h3>
        {fails.length === 0 ? (
          <p className="muted">暂无</p>
        ) : (
          <ul>
            {fails.slice(0, 5).map(([code, n]) => (
              <li key={code}>
                {code}: {n}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
