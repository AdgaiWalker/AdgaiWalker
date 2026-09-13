/**
 * 观测数据页 — 三标签：使用排行 / AI 观测 / 旅程回放。
 * 只读事实；页首固定「砍功能三维判别」，避免只凭使用量砍错功能。
 */
import { useCallback, useEffect, useState } from 'react';
import {
  adminApi,
  type AiStats,
  type JourneyEvent,
  type UsageStats,
} from '../api/admin-api';
import { useAdminAction } from '../hooks/useAdminAction';

type TabId = 'usage' | 'ai' | 'journey';

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'usage', label: '使用排行' },
  { id: 'ai', label: 'AI 观测' },
  { id: 'journey', label: '旅程回放' },
];

const WINDOW_OPTIONS = [7, 30, 90] as const;

const ACTOR_LABEL: Record<string, string> = {
  guest: '访客',
  user: '登录用户',
  owner: '站主',
  anonymous: '匿名',
};

const SOURCE_LABEL: Record<string, string> = {
  clue: '卡口线索',
  assistant: '小影问答',
  'search-miss': '搜索未命中',
  'content-feedback': '读后反馈',
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function DataPage() {
  const [tab, setTab] = useState<TabId>('usage');
  const [days, setDays] = useState<number>(30);
  const [anonId, setAnonId] = useState('');
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [ai, setAi] = useState<AiStats | null>(null);
  const [journey, setJourney] = useState<JourneyEvent[] | null>(null);
  const { err, run } = useAdminAction();

  const load = useCallback(async () => {
    await run(async () => {
      if (tab === 'usage') {
        setUsage(await adminApi.usageStats(days));
        return;
      }
      if (tab === 'ai') {
        setAi(await adminApi.aiStats(days));
        return;
      }
      setJourney(await adminApi.journey(days, anonId.trim() || undefined));
    });
  }, [tab, days, anonId, run]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <header className="page-head">
        <h1>观测</h1>
        <p className="page-lead">
          三标签只读事实：用了什么、AI 顶不顶得住、访客怎么走。
        </p>
      </header>

      <div className="panel">
        <p className="muted" style={{ margin: 0 }}>
          砍功能三维判别：<strong>低频</strong> × <strong>不喂循环</strong> ×{' '}
          <strong>可替代</strong> —— 三条同时成立才砍；只看使用量一定会砍错。
        </p>
      </div>

      <div className="panel">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem 1.25rem',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', gap: '0.35rem' }} role="tablist">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`apple-btn apple-btn-sm ${tab === item.id ? 'apple-btn-dark' : 'apple-btn-secondary'}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {WINDOW_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                className={`apple-btn apple-btn-sm ${days === value ? 'apple-btn-dark' : 'apple-btn-secondary'}`}
                onClick={() => setDays(value)}
              >
                近 {value} 天
              </button>
            ))}
          </div>
        </div>
      </div>

      {err ? <p className="error">{err}</p> : null}

      {tab === 'usage' ? <UsageTab data={usage} /> : null}
      {tab === 'ai' ? <AiTab data={ai} /> : null}
      {tab === 'journey' ? (
        <JourneyTab events={journey} anonId={anonId} onAnonIdChange={setAnonId} />
      ) : null}
    </div>
  );
}

function UsageTab({ data }: { data: UsageStats | null }) {
  if (!data) return <p className="muted">加载中…</p>;
  const features = Object.entries(data.byFeature);

  return (
    <div className="panel">
      <h3>使用排行（近 {data.days} 天）</h3>
      <p className="muted">
        {data.weeks.length > 0
          ? `覆盖 ${data.weeks[0]} → ${data.weeks[data.weeks.length - 1]}（${data.weeks.length} 周）`
          : '窗口内暂无事件'}
      </p>
      {features.length === 0 ? (
        <p className="muted">暂无数据：站点被真实使用一次后，这里才会出现行。</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>功能</th>
              <th>角色</th>
              <th>尝试</th>
              <th>成功</th>
              <th>失败</th>
            </tr>
          </thead>
          <tbody>
            {features.flatMap(([key, buckets]) =>
              (['guest', 'user', 'owner'] as const)
                .filter((actor) => {
                  const row = buckets[actor];
                  return row.attempt + row.success + row.fail > 0;
                })
                .map((actor) => (
                  <tr key={`${key}-${actor}`}>
                    <td>{key}</td>
                    <td>{ACTOR_LABEL[actor]}</td>
                    <td>{buckets[actor].attempt}</td>
                    <td>{buckets[actor].success}</td>
                    <td>{buckets[actor].fail}</td>
                  </tr>
                )),
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AiTab({ data }: { data: AiStats | null }) {
  if (!data) return <p className="muted">加载中…</p>;
  const maxDegrade = Math.max(1, ...data.degradeReasons.map((row) => row.count));

  return (
    <>
      <div className="panel">
        <h3>AI 观测（近 {data.days} 天）</h3>
        <div className="stat-row">
          <div className="stat-chip">
            <span className="stat-chip-label">总问答</span>
            <span className="stat-chip-value">{data.totalRuns}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">AI 占比</span>
            <span className="stat-chip-value">
              {Math.round(data.aiRatio * 100)}%
            </span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">tokens 入 / 出</span>
            <span className="stat-chip-value">
              {data.tokensIn} / {data.tokensOut}
            </span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">缓存读</span>
            <span className="stat-chip-value">{data.cacheReadTokens}</span>
          </div>
        </div>
        <p className="muted">
          耗时 p50 {data.elapsedMs.p50}ms · p90 {data.elapsedMs.p90}ms
          {data.firstChunkMs.p50 > 0
            ? ` · 首字 p50 ${data.firstChunkMs.p50}ms`
            : ''}
        </p>
      </div>

      <div className="panel">
        <h3>降级原因</h3>
        {data.degradeReasons.length === 0 ? (
          <p className="muted">窗口内没有降级——AI 全部正常回答。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {data.degradeReasons.map((row) => (
              <li
                key={row.reason}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: 6,
                }}
              >
                <span style={{ minWidth: '9rem' }}>{row.reason}</span>
                <span
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: 999,
                    background: 'rgba(17,17,17,0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      height: '100%',
                      width: `${Math.round((row.count / maxDegrade) * 100)}%`,
                      borderRadius: 999,
                      background: 'var(--adm-brand, #3b82f6)',
                    }}
                  />
                </span>
                <span className="muted">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <h3>日均预算消耗</h3>
        {data.dailyBudget.length === 0 ? (
          <p className="muted">窗口内没有预算行。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>请求</th>
                <th>tokens 入</th>
                <th>tokens 出</th>
              </tr>
            </thead>
            <tbody>
              {data.dailyBudget.slice(-14).map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td>{row.requests}</td>
                  <td>{row.tokensIn}</td>
                  <td>{row.tokensOut}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function JourneyTab({
  events,
  anonId,
  onAnonIdChange,
}: {
  events: JourneyEvent[] | null;
  anonId: string;
  onAnonIdChange: (value: string) => void;
}) {
  const filtered = anonId.trim().length > 0;

  return (
    <div className="panel">
      <h3>旅程回放</h3>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          alignItems: 'center',
          marginBottom: '0.75rem',
        }}
      >
        <input
          type="text"
          className="apple-input"
          style={{ maxWidth: 320 }}
          value={anonId}
          onChange={(e) => onAnonIdChange(e.target.value)}
          placeholder="按访客匿名 ID 过滤（留空 = 全窗口四源）"
        />
        <span className="muted">
          {filtered
            ? '只看该访客可归属的两源：卡口线索 + 小影问答'
            : '搜索未命中与读后反馈没有匿名键，标记为 anonymous'}
        </span>
      </div>

      {!events || events.length === 0 ? (
        <p className="muted">窗口内没有事件。</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {events.slice(-80).map((event, index) => (
            <li
              key={`${event.at}-${index}`}
              style={{
                display: 'flex',
                gap: '0.6rem',
                padding: '0.35rem 0',
                borderBottom: '1px solid rgba(0,0,0,0.05)',
                alignItems: 'baseline',
              }}
            >
              <span
                className="muted"
                style={{ minWidth: '5.2rem', fontVariantNumeric: 'tabular-nums' }}
              >
                {formatTime(event.at)}
              </span>
              <span style={{ minWidth: '6rem' }}>
                {SOURCE_LABEL[event.source] ?? event.source}
              </span>
              <span className="muted" style={{ minWidth: '3.2rem' }}>
                {ACTOR_LABEL[event.actor] ?? event.actor}
              </span>
              <span style={{ flex: 1 }}>{event.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
