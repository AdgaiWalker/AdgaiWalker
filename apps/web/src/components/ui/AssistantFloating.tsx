/**
 * 小影悬浮窗 — 全站可唤起的伴生对话（Portal 到 body，与画布变换解耦）。
 * 会话与 /ask 各自独立（刷新即新会话）；焦点管理沿用 SearchModal 模式。
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useAssistant } from '../../hooks/useAssistant';
import { isValidAssistantBody } from '@walker/shared';
import { AssistantThread } from './AssistantThread';

export function AssistantFloating({
  open,
  onClose,
  returnFocusTarget,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusTarget?: HTMLElement | null;
}) {
  const { messages, loading, error, send, reset } = useAssistant();
  const [draft, setDraft] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 打开时焦点入输入框；关闭时还给悬浮按钮
  useEffect(() => {
    if (!open) return;
    const returnFocus =
      returnFocusTarget ?? (document.activeElement as HTMLElement | null);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => {
      window.clearTimeout(timer);
      returnFocus?.focus();
    };
  }, [open, returnFocusTarget]);

  if (!open) return null;

  const draftOk = isValidAssistantBody(draft);

  return createPortal(
    <div
      ref={panelRef}
      className="assistant-float"
      role="dialog"
      aria-label="问小影"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <header className="assistant-head assistant-float-head">
        <span className="assistant-dot" aria-hidden />
        <span className="assistant-name">小影</span>
        <span className="meta">duola 的管家 · 在线</span>
        {messages.length ? (
          <button
            type="button"
            className="btn-ghost assistant-reset"
            onClick={() => {
              reset();
              setDraft('');
            }}
          >
            重新开始
          </button>
        ) : null}
        <button
          type="button"
          className="assistant-float-close"
          aria-label="关闭小影"
          onClick={onClose}
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      <AssistantThread
        draft={draft}
        draftOk={draftOk}
        loading={loading}
        error={error}
        messages={messages}
        onDraftChange={setDraft}
        onSubmit={() => void send(draft)}
        onAskExample={(text) => void send(text)}
        idPrefix="assistant-float"
        compact
      />
    </div>,
    document.body,
  );
}
