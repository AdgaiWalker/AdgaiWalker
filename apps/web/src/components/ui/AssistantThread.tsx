/**
 * AssistantThread — 消息流 + 空态示例 + 输入条（纯展示，两壳共用：/ask 整页 / 悬浮窗）。
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

export type AssistantThreadProps = {
  draft: string;
  draftOk: boolean;
  loading: boolean;
  streaming?: boolean;
  error: string | null;
  messages: readonly AssistantMessage[];
  onDraftChange: (text: string) => void;
  onSubmit: () => void;
  onAskExample?: (text: string) => void;
  onStop?: () => void;
  /** 输入框 label/aria 前缀（整页与悬浮窗区分） */
  idPrefix?: string;
  /** 悬浮窗隐藏底部「去卡口」脚注（窗内已有窄栏出口） */
  compact?: boolean;
  /** 外部焦点控制（如悬浮窗打开时聚焦）；不传则内部自建 */
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
};

export function AssistantThread({
  draft,
  draftOk,
  loading,
  streaming = false,
  error,
  messages,
  onDraftChange,
  onSubmit,
  onAskExample,
  onStop,
  idPrefix = 'assistant',
  compact = false,
  inputRef: externalInputRef,
}: AssistantThreadProps) {
  const internalInputRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, loading]);

  const inputId = `${idPrefix}-input`;

  return (
    <>
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
                  <p className="success-meta">
                    {m.aiUsedFlag ? 'AI' : '规则'}
                    {m.stopped ? ' · 已停止' : ''}
                  </p>
                </div>
              ),
            )}
            {loading ? (
              streaming ? (
                <p className="meta assistant-streaming" aria-live="polite">
                  小影正在说…
                  {onStop ? (
                    <button
                      type="button"
                      className="assistant-stop"
                      onClick={onStop}
                    >
                      停止
                    </button>
                  ) : null}
                </p>
              ) : (
                <p className="meta" aria-live="polite">
                  小影正在想…（最长约 15 秒，超时会给固定回答）
                </p>
              )
            ) : null}
          </div>
        )}
      </div>

      <div className="assistant-composer">
        <label htmlFor={inputId} className="sr-only">
          问小影
        </label>
        <textarea
          id={inputId}
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
          placeholder="问点什么…（两字起送，Enter 发送）"
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

      <p className="meta" style={{ margin: '4px 0 0' }}>
        问过的问题会进入站主的选题池——你的问题可能变成下一篇文章
      </p>

      {error ? (
        <div className="alert-fail" role="alert">
          {error}
        </div>
      ) : null}

      {!compact ? (
        <p className="meta assistant-footnote">
          回答只依据站内公开内容 · 想做成某事？去
          <Link to={dualEntry.ask.path}>卡口</Link>
          拿行动建议
        </p>
      ) : null}
    </>
  );
}
