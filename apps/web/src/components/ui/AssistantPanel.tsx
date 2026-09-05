/**
 * 小影对话面板 — 三段式：状态窄栏 / 对话流 / 底部输入条。
 * 数据 in / 事件 out，无 API；引用渲染真实文章标题。
 */
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getPostBySlug } from '../../content';
import type { AssistantMessage } from '../../hooks/useAssistant';
import { dualEntry } from '../../shared/dual-entry';

export const ASSISTANT_EXAMPLES = [
  'duola 是谁？',
  '想学 AI 从哪开始？',
  '这站能帮我什么？',
] as const;

export type AssistantPanelProps = {
  draft: string;
  draftOk: boolean;
  loading: boolean;
  error: string | null;
  messages: readonly AssistantMessage[];
  onDraftChange: (text: string) => void;
  onSubmit: () => void;
  onReset: () => void;
  onAskExample?: (text: string) => void;
};

export function AssistantPanel({
  draft,
  draftOk,
  loading,
  error,
  messages,
  onDraftChange,
  onSubmit,
  onReset,
  onAskExample,
}: AssistantPanelProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, loading]);

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
        ) : null}
      </header>

      <div className="assistant-log" ref={logRef}>
        {messages.length === 0 ? (
          <div className="assistant-empty">
            <p className="meta" style={{ marginBottom: 14 }}>
              关于 duola、站内内容或学习路径，直接问；答不上会老实说不知道。
            </p>
            <div className="assistant-examples">
              {ASSISTANT_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="assistant-example-chip"
                  disabled={loading}
                  onClick={() => onAskExample?.(ex)}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="assistant-thread">
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
                  <p className="success-meta">{m.aiUsedFlag ? 'AI' : '规则'}</p>
                </div>
              ),
            )}
            {loading ? (
              <p className="meta" aria-live="polite">
                小影正在想…（最长约 15 秒，超时会给固定回答）
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div className="assistant-composer">
        <textarea
          id="assistant-input"
          ref={inputRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter 发送、Shift+Enter 换行；输入法组词中不触发
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              if (draftOk && !loading) onSubmit();
            }
          }}
          placeholder="问点什么…（两字起送，Enter 发送，Shift+Enter 换行）"
          disabled={loading}
          rows={2}
        />
        <button
          type="button"
          className="btn-primary assistant-send"
          disabled={loading || !draftOk}
          onClick={onSubmit}
        >
          {loading ? '回答中…' : '发送'}
        </button>
      </div>

      {error ? (
        <div className="alert-fail" role="alert">
          {error}
        </div>
      ) : null}

      <p className="meta assistant-footnote">
        回答只依据站内公开内容 · 想做成某事？去
        <Link to={dualEntry.ask.path}>卡口</Link>
        拿行动建议
      </p>
    </div>
  );
}
