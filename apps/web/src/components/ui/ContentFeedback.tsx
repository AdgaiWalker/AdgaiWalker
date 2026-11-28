/**
 * ContentFeedback — 展示块：读后反馈（与点赞分列），无 API。
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

  const showNote = pendingSignal === 'needs-more' || pendingSignal === 'outdated';

  return (
    <div className="feedback-quiet">
      <h3>这篇对你有用吗？</h3>
      <div className="feedback-choices">
        <button type="button" className="btn-ghost" disabled={busy} onClick={onSelectUseful}>
          有用
        </button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={onSelectNeedsMore}>
          需补充
        </button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={onSelectOutdated}>
          已过时
        </button>
      </div>
      {showNote ? (
        <div className="feedback-note">
          <textarea
            placeholder="可选说明"
            value={note}
            disabled={busy}
            onChange={(e) => onNoteChange(e.target.value)}
          />
          <button type="button" className="btn-ghost" disabled={busy} onClick={onSubmitPending}>
            提交
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="alert-fail" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
