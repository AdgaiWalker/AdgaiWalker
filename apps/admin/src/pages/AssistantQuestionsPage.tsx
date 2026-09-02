/**
 * 助手问题池 — 访客在 /ask 问过的每个问题都是需求信号。
 * 站主人工筛选 → 一键转题苗（POST /seeds）；AI 只提供数据，不筛选不主选（红线）。
 */
import { useCallback, useEffect, useState } from 'react';
import { adminApi, type AssistantQuestion } from '../api/admin-api';
import { useAdminAction } from '../hooks/useAdminAction';

export function AssistantQuestionsPage() {
  const [list, setList] = useState<AssistantQuestion[]>([]);
  const [converted, setConverted] = useState<Record<string, boolean>>({});
  const { err, run } = useAdminAction();

  const load = useCallback(async () => {
    await run(async () => {
      setList(await adminApi.assistantQuestions());
    });
  }, [run]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <header className="page-head">
        <h1>助手问题</h1>
        <p className="page-lead">
          访客问过的问题 · 问得最多的就是下一篇该写的 · 人工转题苗
        </p>
      </header>
      {err ? <p className="alert-fail">{err}</p> : null}
      <div className="panel">
        {list.length === 0 ? (
          <p className="page-lead">还没有访客提问。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {list.map((q) => (
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
                  {q.citations.length
                    ? ` ｜ 引用 ${q.citations.join(' / ')}`
                    : ''}
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
                  {converted[q.id] ? '已转题苗' : '转题苗'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
