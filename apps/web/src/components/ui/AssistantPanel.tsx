/**
 * 小影对话页壳 — 状态窄栏 + AssistantThread（消息流与输入由公共组件承担）。
 */
import { Link } from 'react-router-dom';
import type { AssistantMessage } from '../../hooks/useAssistant';
import { dualEntry } from '../../shared/dual-entry';
import { AssistantThread } from './AssistantThread';

export type AssistantPanelProps = {
  draft: string;
  draftOk: boolean;
  loading: boolean;
  streaming?: boolean;
  error: string | null;
  messages: readonly AssistantMessage[];
  onDraftChange: (text: string) => void;
  onSubmit: () => void;
  onReset: () => void;
  onStop?: () => void;
  onAskExample?: (text: string) => void;
};

export function AssistantPanel({
  draft,
  draftOk,
  loading,
  streaming,
  error,
  messages,
  onDraftChange,
  onSubmit,
  onReset,
  onStop,
  onAskExample,
}: AssistantPanelProps) {
  return (
    <div className="assistant-page">
      <header className="assistant-head">
        <span className="assistant-dot" aria-hidden />
        <span className="assistant-name">小影</span>
        <span className="meta">duola 的管家 · 在线</span>
        {messages.length ? (
          <button
            type="button"
            className="btn-ghost assistant-reset"
            onClick={onReset}
          >
            重新开始
          </button>
        ) : (
          <Link
            to={dualEntry.ask.path}
            className="btn-ghost assistant-reset"
            aria-label="去卡口拿行动建议"
          >
            去卡口
          </Link>
        )}
      </header>

      <AssistantThread
        draft={draft}
        draftOk={draftOk}
        loading={loading}
        streaming={streaming}
        error={error}
        messages={messages}
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
        onAskExample={onAskExample}
        onStop={onStop}
      />
    </div>
  );
}
