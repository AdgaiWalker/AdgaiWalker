/**
 * 需求页 — 四源信号中心 + 高频榜 + 内容缺口 + AI 需求周报。
 * 语言原则：零比喻（需求/问题/搜索/反馈/选题/内容/产品/变现）。
 */
import { useCallback, useEffect, useState } from 'react';
import {
  adminApi,
  type AssistantQuestion,
} from '../api/admin-api';
import { useAdminAction } from '../hooks/useAdminAction';

type SignalSource = 'assistant' | 'intake' | 'search-miss' | 'feedback';

const SOURCE_LABEL: Record<SignalSource, string> = {
  assistant: '问了小影',
  intake: '卡口提问',
  'search-miss': '搜索没找到',
  feedback: '文章反馈',
};

interface Signal {
  id: string;
  source: SignalSource;
  text: string;
  createdAt: string;
}
interface Frequency {
  display: string;
  count: number;
  sources: SignalSource[];
}
interface Gap {
  query: string;
  count: number;
  covered: boolean;
  matchedTitles: string[];
}
interface SignalsView {
  days: number;
  signals: Signal[];
  frequency: Frequency[];
  gaps: Gap[];
}
interface Suggestion {
  kind: 'write' | 'build' | 'post' | 'business';
  text: string;
  evidence: string;
}
interface ReportData {
  themes: { title: string; count: number; examples: string[] }[];
  gaps: string[];
  suggestions: Suggestion[];
  summary: string;
}
interface Report {
  id: string;
  weekOf: string;
  report: ReportData;
  createdAt: string;
}

const KIND_LABEL: Record<Suggestion['kind'], string> = {
  write: '写文章',
  build: '做产品',
  post: '自媒体选题',
  business: '商业信号',
};

export function InsightsPage() {
  const [view, setView] = useState<SignalsView | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [questions, setQuestions] = useState<AssistantQuestion[]>([]);
  const [converted, setConverted] = useState<Record<string, boolean>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const { err, run } = useAdminAction();

  const load = useCallback(async () => {
    await run(async () => {
      const [v, rs, qs] = await Promise.all([
        adminApi.insightsSignals(),
        adminApi.insightReports(),
        adminApi.assistantQuestions(),
      ]);
      setView(v as SignalsView);
      setReports(rs as Report[]);
      setQuestions(qs);
    });
  }, [run]);

  useEffect(() => {
    void load();
  }, [load]);

  const analyze = useCallback(() => {
    setAnalyzing(true);
    void run(async () => {
      await adminApi.insightReportGenerate();
      const rs = await adminApi.insightReports();
      setReports(rs as Report[]);
    }).finally(() => setAnalyzing(false));
  }, [run]);

  const latest = reports[0];

  return (
    <div>
      <header className="page-head">
        <h1>需求</h1>
        <p className="page-lead">
          访客问过什么、搜过什么、反馈过什么——决定接下来写什么、做什么
        </p>
      </header>
      {err ? <p className="alert-fail">{err}</p> : null}

      <div className="panel">
        <h3>
          AI 需求周报
          <button
            type="button"
            style={{ marginLeft: 12 }}
            disabled={analyzing}
            onClick={analyze}
          >
            {analyzing ? '分析中…（约 1 分钟）' : '分析近 7 天'}
          </button>
        </h3>
        {latest ? (
          <div>
            <p className="page-lead">{latest.report.summary}</p>
            <h4>需求主题</h4>
            <ul>
              {latest.report.themes.map((t) => (
                <li key={t.title}>
                  <strong>{t.title}</strong>（{t.count} 次）
                  {t.examples.length ? ` · 例如：${t.examples[0]}` : ''}
                </li>
              ))}
            </ul>
            {latest.report.gaps.length ? (
              <>
                <h4>内容缺口</h4>
                <p className="meta">{latest.report.gaps.join('；')}</p>
              </>
            ) : null}
            <h4>建议（人工确认后才转选题）</h4>
            <ul>
              {latest.report.suggestions.map((s, i) => (
                <li key={i} style={{ margin: '6px 0' }}>
                  <span className="meta">[{KIND_LABEL[s.kind]}]</span> {s.text}
                  <button
                    type="button"
                    style={{ marginLeft: 10 }}
                    disabled={converted[`${latest.id}-${i}`]}
                    onClick={() =>
                      void run(async () => {
                        await adminApi.createSeed(s.text.slice(0, 120));
                        setConverted((prev) => ({
                          ...prev,
                          [`${latest.id}-${i}`]: true,
                        }));
                      })
                    }
                  >
                    {converted[`${latest.id}-${i}`] ? '已转选题' : '转选题'}
                  </button>
                  {s.evidence ? (
                    <span className="meta"> 依据：{s.evidence}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="meta">
              生成于 {new Date(latest.createdAt).toLocaleString('zh-CN')}
              {reports.length > 1
                ? ` · 历史 ${reports.length - 1} 份`
                : ''}
            </p>
          </div>
        ) : (
          <p className="page-lead">还没有周报。点「分析近 7 天」生成一份。</p>
        )}
      </div>

      <div className="panel">
        <h3>高频问题（近 {view?.days ?? 30} 天）</h3>
        {view?.frequency.length ? (
          <ol style={{ paddingLeft: 20 }}>
            {view.frequency.map((f) => (
              <li key={f.display} style={{ margin: '4px 0' }}>
                {f.display}
                <span className="meta">
                  {' '}
                  {f.count} 次 ·{' '}
                  {f.sources.map((s) => SOURCE_LABEL[s]).join('/')}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="page-lead">暂无数据。</p>
        )}
      </div>

      <div className="panel">
        <h3>内容缺口（搜索没找到对应内容的词）</h3>
        {view?.gaps.filter((g) => !g.covered).length ? (
          <ul>
            {view.gaps
              .filter((g) => !g.covered)
              .map((g) => (
                <li key={g.query}>
                  {g.query} <span className="meta">搜了 {g.count} 次，站内没有对应内容</span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="page-lead">近 {view?.days ?? 30} 天没有未覆盖的搜索词。</p>
        )}
      </div>

      <div className="panel">
        <h3>全部信号</h3>
        {view?.signals.length ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {view.signals.slice(0, 100).map((s) => (
              <li
                key={s.id}
                style={{
                  borderBottom: '1px solid rgba(127,150,160,.14)',
                  padding: '8px 0',
                }}
              >
                <span className="meta">[{SOURCE_LABEL[s.source]}]</span>{' '}
                {s.text.slice(0, 90)}
                <span className="meta">
                  {' '}
                  {new Date(s.createdAt).toLocaleDateString('zh-CN')}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="page-lead">暂无信号。</p>
        )}
      </div>

      <div className="panel">
        <h3>小影问答记录（逐条转选题）</h3>
        {questions.length === 0 ? (
          <p className="page-lead">还没有访客提问。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {questions.map((q) => (
              <li
                key={q.id}
                style={{
                  borderBottom: '1px solid rgba(127,150,160,.18)',
                  padding: '12px 0',
                }}
              >
                <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
                  {q.question}
                  <span className="meta" style={{ marginLeft: 8 }}>
                    {q.aiUsedFlag ? 'AI' : '规则'} · {q.elapsedMs}ms ·{' '}
                    {new Date(q.createdAt).toLocaleString('zh-CN')}
                  </span>
                </p>
                <p className="meta" style={{ margin: '0 0 4px' }}>
                  答：{q.answer.slice(0, 80)}
                  {q.answer.length > 80 ? '…' : ''}
                </p>
                <button
                  type="button"
                  disabled={converted[q.id]}
                  onClick={() =>
                    void run(async () => {
                      await adminApi.createSeed(q.question.slice(0, 120));
                      setConverted((prev) => ({ ...prev, [q.id]: true }));
                    })
                  }
                >
                  {converted[q.id] ? '已转选题' : '转选题'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
