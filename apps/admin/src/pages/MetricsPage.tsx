import { useEffect, useState } from 'react';
import { adminApi, type Metrics } from '../api/admin-api';

const BUCKET_LABEL: Record<string, string> = {
  visitor: '访客卡口',
  self: '站主自记',
  external: '外贴（微信/直播等）',
};

export function MetricsPage() {
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void adminApi
      .metrics()
      .then(setM)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  if (err) return <p className="error">{err}</p>;
  if (!m) return <p className="muted">加载中…</p>;

  const fails = Object.entries(m.features.failCodes).sort((a, b) => b[1] - a[1]);
  const box = m.clueSources;
  const d14 = box?.byBucket14d;

  return (
    <div>
      <h1>指标 / 冷热</h1>
      <div className="panel">
        <p>
          线索 {m.clues} · 题苗 {m.seeds} · 执行 {m.executions}
        </p>
        <p>
          可计数闭环 {m.countableLoops} · 有用 {m.yesCount} · 外部闭环{' '}
          {m.externalLoopCount}
        </p>
      </div>

      {box ? (
        <div className="panel">
          <h3>线索来源（A11 验证盒）</h3>
          <p className="muted">
            近 {box.windowDays} 天分桶，用于到期决定「卡」入口加强 / 维持 / 降权
          </p>
          <table>
            <thead>
              <tr>
                <th>分桶</th>
                <th>近 {box.windowDays} 天</th>
                <th>全量</th>
              </tr>
            </thead>
            <tbody>
              {(['visitor', 'self', 'external'] as const).map((k) => (
                <tr key={k}>
                  <td>{BUCKET_LABEL[k]}</td>
                  <td>{d14?.[k] ?? 0}</td>
                  <td>{box.byBucket[k] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ marginTop: '1rem' }}>原始 source</h3>
          <ul>
            {Object.entries(box.bySource).map(([src, n]) => (
              <li key={src}>
                {src}: {n}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="panel">
        <h3>功能事件（近 7 日）</h3>
        <table>
          <thead>
            <tr>
              <th>功能</th>
              <th>尝试</th>
              <th>成功</th>
              <th>失败</th>
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
