/**
 * AssistantThread — 消息流 + 空态示例 + 输入条（纯展示，两壳共用：/ask 整页 / 搜索面板）。
 * 数据 in / 事件 out，无 API；引用渲染真实文章标题。
 */
import { useEffect, useRef } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { XMarkdown } from '@ant-design/x-markdown';
import '@ant-design/x-markdown/dist/x-markdown.css';
import { getPostBySlug } from '../../content';
import type { AssistantMessage } from '../../hooks/useAssistant';
import { dualEntry } from '../../shared/dual-entry';
import type { AssistantInteractionFeedback } from '@walker/shared';

export const ASSISTANT_EXAMPLES = [
  'Dora 是谁？',
  '想学 AI 从哪开始？',
  '这站能帮我什么？',
] as const;

export const HIDDEN_HISTORY_ANSWER = '这条历史回答对应的成员已不在当前公开位置，内容已隐藏。';

export type AssistantThreadProps = {
  draft: string;
  draftOk: boolean;
  loading: boolean;
  disabled?: boolean;
  stopPending?: boolean;
  stopAvailable?: boolean;
  streaming?: boolean;
  error: string | null;
  messages: readonly AssistantMessage[];
  onDraftChange: (text: string) => void;
  onSubmit: () => void;
  onAskExample?: (text: string) => void;
  onCitationClick?: (messageId: string, targetSlug: string) => void;
  onFeedback?: (messageId: string, feedback: AssistantInteractionFeedback) => void;
  onStop?: () => void;
  /** 输入框 label/aria 前缀（整页与搜索面板区分） */
  idPrefix?: string;
  /** 搜索面板隐藏底部「去卡口」脚注（面板头已有出口） */
  compact?: boolean;
  /** 当前公开位置选中的成员名称。 */
  assistantName?: string;
  /** 外部焦点控制（如面板打开时聚焦）；不传则内部自建 */
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
};

export function AssistantThread({
  draft,
  draftOk,
  loading,
  disabled = false,
  stopPending = false,
  stopAvailable = true,
  streaming = false,
  error,
  messages,
  onDraftChange,
  onSubmit,
  onAskExample,
  onCitationClick,
  onFeedback,
  onStop,
  idPrefix = 'assistant',
  compact = false,
  assistantName = '小影',
  inputRef: externalInputRef,
}: AssistantThreadProps) {
  const internalInputRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // jsdom 等环境无 Element.scrollTo，可选调用兜底
    logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight });
  }, [messages, loading]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, 44), 180);
    el.style.height = `${next}px`;
  }, [draft, inputRef]);

  const inputId = `${idPrefix}-input`;
  const inputDisabled = loading || disabled;

  return (
    <>
      <div className="assistant-log" ref={logRef}>
        {messages.length === 0 ? (
          <div className="assistant-empty">
            <p className="meta" style={{ marginBottom: 14 }}>
              关于 Dora、站内内容或学习路径，直接问；答不上会老实说不知道。
            </p>
            <div className="assistant-examples">
              {ASSISTANT_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="assistant-example-chip"
                  disabled={inputDisabled}
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
                  {m.hidden ? (
                    <p className="meta">{HIDDEN_HISTORY_ANSWER}</p>
                  ) : (
                    <XMarkdown
                      content={m.text}
                      openLinksInNewTab
                      escapeRawHtml
                      streaming={
                        i === messages.length - 1 && streaming
                          ? { hasNextChunk: true, enableAnimation: true, tail: true }
                          : undefined
                      }
                    />
                  )}
                  {!m.hidden && m.citations.length ? (
                    <p className="success-meta">
                      相关：
                      {m.citations.map((slug) => {
                        const post = getPostBySlug(slug);
                        return (
                          <Link
                            key={slug}
                            to={`${dualEntry.browse.path}/${encodeURIComponent(slug)}`}
                            onClick={() => { if (m.id) onCitationClick?.(m.id, slug); }}
                          >
                            《{post?.title ?? slug}》
                          </Link>
                        );
                      })}
                    </p>
                  ) : null}
                  {!m.hidden ? (
                    <p className="success-meta">
                      {m.member ? `${m.member.name} · v${m.member.revision}` : m.aiUsedFlag ? 'AI' : '规则'}
                      {m.partial ? ' · 未写完（到时间上限，先给你已生成的部分）' : ''}
                      {m.delivery === 'partial' ? ' · 未完成' : ''}
                      {m.stopped ? ' · 已停止' : ''}
                    </p>
                  ) : null}
                  {!m.hidden && m.nextStep ? (
                    <div className="assistant-next-step" style={{ marginTop: 8, padding: '8px 12px', borderLeft: '3px solid var(--accent, #6366f1)', background: 'var(--surface-sunken, rgba(0,0,0,0.03))', borderRadius: '0 4px 4px 0' }}>
                      <p style={{ fontWeight: 600, fontSize: '0.9em', margin: '0 0 4px', color: 'var(--accent, #6366f1)' }}>
                        {m.nextStep.bucketLabel ? `建议下一步（${m.nextStep.bucketLabel}）` : '建议下一步'}
                      </p>
                      <p style={{ margin: 0 }}>{m.nextStep.nextStep}</p>
                      {m.nextStep.suggestedSlug ? (
                        <p className="success-meta" style={{ marginTop: 4 }}>
                          推荐参考：
                          <Link to={`${dualEntry.browse.path}/${encodeURIComponent(m.nextStep.suggestedSlug)}`}>
                            《{m.nextStep.suggestedTitle ?? m.nextStep.suggestedSlug}》
                          </Link>
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {!m.hidden && m.quickReplies && m.quickReplies.length > 0 ? (
                    <div className="assistant-examples" style={{ marginTop: 8 }}>
                      {m.quickReplies.map((reply) => (
                        <button
                          key={reply}
                          type="button"
                          className="assistant-example-chip"
                          disabled={inputDisabled}
                          onClick={() => onAskExample?.(reply)}
                        >
                          {reply}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {!m.hidden && m.id && onFeedback ? (
                    <div className="assistant-feedback-actions" aria-label="回答反馈">
                      <button type="button" aria-label="回答有帮助" onClick={() => onFeedback(m.id!, 'helpful')}>
                        <ThumbsUp size={14} aria-hidden="true" />
                      </button>
                      <button type="button" aria-label="回答没帮助" onClick={() => onFeedback(m.id!, 'not-helpful')}>
                        <ThumbsDown size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </div>
              ),
            )}
            {loading ? (
              streaming ? (
                <p className="meta assistant-streaming" aria-live="polite">
                  {assistantName}正在说…
                  {onStop ? (
                    <button
                      type="button"
                      className="assistant-stop"
                      onClick={onStop}
                      disabled={stopPending || !stopAvailable}
                    >
                      {stopPending ? '正在停止…' : '停止'}
                    </button>
                  ) : null}
                </p>
              ) : (
                <p className="meta" aria-live="polite">
                  {assistantName}正在想…（答到一半也会先把已经写好的给你）
                </p>
              )
            ) : null}
          </div>
        )}
      </div>

      <div className="assistant-composer">
        <label htmlFor={inputId} className="sr-only">
          {`问${assistantName}`}
        </label>
        <textarea
          id={inputId}
          ref={inputRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && loading && onStop) {
              e.preventDefault();
              onStop();
              return;
            }
            // Enter 发送、Shift+Enter 换行；输入法组词中不触发
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              if (draftOk && !inputDisabled) onSubmit();
            }
          }}
          placeholder={
            loading
              ? `${assistantName}正在回答…（按 Esc 键或点击停止）`
              : '问点什么…（两字起送，Enter 发送）'
          }
          disabled={inputDisabled}
          rows={2}
        />
        {loading && onStop ? (
          <button
            type="button"
            className="btn-ghost assistant-stop chat-stop-btn"
            onClick={onStop}
            disabled={stopPending || !stopAvailable}
            title="停止生成（按 Esc 键亦可）"
          >
            {stopPending ? '停止中…' : '停止回答'}
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary assistant-send"
            disabled={inputDisabled || !draftOk}
            onClick={onSubmit}
          >
            发送
          </button>
        )}
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
          回答依据站内公开内容与行动模型 · 说清真实卡点，即可获得下一步拆解
        </p>
      ) : null}
    </>
  );
}
