import { useState } from 'react';

type Signal = 'useful' | 'needs-more' | 'outdated';

export function ContentFeedback({ contentId }: { contentId: string }) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [signal, setSignal] = useState<Signal | null>(null);

  async function submit(sig: Signal) {
    setSignal(sig);
    setErr(null);
    try {
      const res = await fetch('/api/content-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId,
          signal: sig,
          note: sig === 'useful' ? undefined : note,
        }),
      });
      const data = (await res.json()) as { code?: string };
      if (!res.ok) {
        setErr(data.code ?? res.statusText);
        return;
      }
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (done) {
    return <p className="meta">已收到反馈，谢谢。</p>;
  }

  return (
    <div
      className="panel-glass"
      style={{ marginTop: '1.25rem', padding: '1.15rem 1.25rem', borderRadius: 24 }}
    >
      <h3 style={{ margin: '0 0 0.35rem', fontSize: '1rem' }}>这篇对你有用吗？</h3>
      <p className="meta">阅读结果反馈（与点赞分开）</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button type="button" className="btn-primary" onClick={() => void submit('useful')}>
          有用
        </button>
        <button type="button" className="btn-ghost" onClick={() => setSignal('needs-more')}>
          需补充
        </button>
        <button type="button" className="btn-ghost" onClick={() => setSignal('outdated')}>
          已过时
        </button>
      </div>
      {signal && signal !== 'useful' ? (
        <div style={{ marginTop: 10 }}>
          <textarea
            placeholder="可选说明"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="button" className="btn-primary" onClick={() => void submit(signal)}>
            提交
          </button>
        </div>
      ) : null}
      {err ? <p className="meta">失败：{err}</p> : null}
    </div>
  );
}
