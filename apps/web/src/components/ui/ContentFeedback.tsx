/**
 * ContentFeedback — 展示块：反馈表单 UI，无 API
 */
import type { ContentFeedbackSignal } from '../../shared/content-feedback';

export type { ContentFeedbackSignal };

export type ContentFeedbackProps = {
  done: boolean;
  error: string | null;
  note: string;
  /** 当前展开的档位（需补充/已过时时显示说明框） */
  pendingSignal: ContentFeedbackSignal | null;
  busy?: boolean;
  onSelectUseful: () => void;
  onSelectNeedsMore: () => void;
  onSelectOutdated: () => void;
  onNoteChange: (note: string) => void;
  onSubmitPending: () => void;
};

export function ContentFeedback({
  done,
  error,
  note,
  pendingSignal,
  busy = false,
  onSelectUseful,
  onSelectNeedsMore,
  onSelectOutdated,
  onNoteChange,
  onSubmitPending,
}: ContentFeedbackProps) {
  if (done) {
    return <p className="meta">已收到反馈，谢谢。</p>;
  }

  const showNote =
    pendingSignal === 'needs-more' || pendingSignal === 'outdated';

  return (
    <div className="feedback-quiet">
      <h3>这篇对你有用吗？</h3>
      <p className="meta" style={{ marginTop: 0 }}>
        阅读结果（与点赞分开）
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy}
          onClick={onSelectUseful}
        >
          有用
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy}
          onClick={onSelectNeedsMore}
        >
          需补充
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy}
          onClick={onSelectOutdated}
        >
          已过时
        </button>
      </div>
      {showNote ? (
        <div style={{ marginTop: 10 }}>
          <textarea
            placeholder="可选说明"
            value={note}
            disabled={busy}
            onChange={(e) => onNoteChange(e.target.value)}
          />
          <button
            type="button"
            className="btn-ghost"
            style={{ marginTop: 8 }}
            disabled={busy}
            onClick={onSubmitPending}
          >
            提交
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="alert-fail" role="alert" style={{ marginTop: 10 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
