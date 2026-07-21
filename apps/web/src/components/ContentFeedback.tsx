import { useState } from 'react';
import { ApiError } from '../api/http';
import {
  publicApi,
  type ContentFeedbackSignal,
} from '../api/public-api';
import { explainErrorCode } from '../shared/rules-ui';

export function ContentFeedback({ contentId }: { contentId: string }) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [signal, setSignal] = useState<ContentFeedbackSignal | null>(null);

  async function submit(sig: ContentFeedbackSignal) {
    setSignal(sig);
    setErr(null);
    try {
      await publicApi.contentFeedback({
        contentId,
        signal: sig,
        note: sig === 'useful' ? undefined : note,
      });
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(explainErrorCode(e.code, e.message));
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    }
  }

  if (done) {
    return <p className="meta">已收到反馈，谢谢。</p>;
  }

  return (
    <div className="feedback-quiet">
      <h3>这篇对你有用吗？</h3>
      <p className="meta" style={{ marginTop: 0 }}>
        阅读结果（与点赞分开）
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button type="button" className="btn-ghost" onClick={() => void submit('useful')}>
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
          <button
            type="button"
            className="btn-ghost"
            style={{ marginTop: 8 }}
            onClick={() => void submit(signal)}
          >
            提交
          </button>
        </div>
      ) : null}
      {err ? (
        <div className="alert-fail" role="alert" style={{ marginTop: 10 }}>
          {err}
        </div>
      ) : null}
    </div>
  );
}
