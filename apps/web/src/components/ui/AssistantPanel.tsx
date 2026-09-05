/**
 * AssistantPanel — 站内助手对话展示块：数据 in / 事件 out，无 API
 * 视觉语言对齐 IntakePanel（徽标/诚实提示/出口引导）。
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getPostBySlug } from '../../content';
import type { AssistantMessage } from '../../hooks/useAssistant';
import { dualEntry } from '../../shared/dual-entry';

export type AssistantPanelProps = {
  title: string;
  lead: ReactNode;
  draft: string;
  draftOk: boolean;
  loading: boolean;
  error: string | null;
  messages: readonly AssistantMessage[];
  onDraftChange: (text: string) => void;
  onSubmit: () => void;
  onReset: () => void;
};

export function AssistantPanel({
  title,
  lead,
  draft,
  draftOk,
  loading,
  error,
  messages,
  onDraftChange,
  onSubmit,
  onReset,
}: AssistantPanelProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, loading]);

  return (
    <div className="instrument-page">
      <h1 className="page-title">{title}</h1>
      <p className="page-lead">{lead}</p>

      <div className="surface-l2 instrument-panel assistant-panel" ref={logRef}>
        {messages.length === 0 ? (
          <p className="meta">问站主、问内容、问路径都行——比如「duola 是谁」「想学 AI 从哪开始」。</p>
        ) : (
          <div className="assistant-log">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <p key={i} className="assistant-msg assistant-msg-user">
                  {m.text}
                </p>
              ) : (
                <div key={i} className="assistant-msg assistant-msg-bot">
                  <p>{m.text}</p>
                  {m.citations.length ? (
                    <p className="success-meta">
                      相关：
                      {m.citations.map((slug) => {
                        const post = getPostBySlug(slug);
                        return (
                          <Link key={slug} to={`/posts/${slug}`}>
                            《{post?.title ?? slug}》
                          </Link>
                        );
                      })}
                    </p>
                  ) : null}
                  <p className="success-meta">
                    {m.aiUsedFlag ? 'AI' : '规则'}
                  </p>
                </div>
              ),
            )}
            {loading ? (
              <p className="meta" aria-live="polite">
                助手思考中…（最长约 15 秒，超时会给固定回答）
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div className="surface-l2 instrument-panel">
        <label htmlFor="assistant-input">你的问题</label>
        <textarea
          id="assistant-input"
          ref={inputRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter 发送、Shift+Enter 换行；禁用态不吞按键
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (draftOk && !loading) onSubmit();
            }
          }}
          placeholder="例如：duola 是谁？想学 AI 从哪开始？（两字起送，Enter 发送，Shift+Enter 换行）"
          disabled={loading}
          style={{ marginTop: 8 }}
        />
        <div className="instrument-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={loading || !draftOk}
            onClick={onSubmit}
          >
            {loading ? '回答中…' : '发送'}
          </button>
          {messages.length ? (
            <button type="button" className="btn-ghost" onClick={onReset}>
              重新开始
            </button>
          ) : (
            <Link to={dualEntry.ask.path} className="btn-ghost">
              想拿行动下一步？去卡口
            </Link>
          )}
        </div>

        {error ? (
          <div className="alert-fail" role="alert">
            {error}
          </div>
        ) : null}

        <p className="meta" style={{ marginTop: 10, marginBottom: 0 }}>
          回答只依据站内公开内容，答不上会说不知道 · 想做成某事？去卡口拿行动建议
        </p>
      </div>
    </div>
  );
}
