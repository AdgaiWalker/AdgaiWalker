import { XiaoyingPet } from '../xiaoying/XiaoyingPet';
import { getPetActivity } from '../xiaoying/activity';
/**
 * SearchModal — 「搜索或问小影」一体面板。
 * 搜索 query/hits 受控于壳侧 useContentSearch；面板内自有 useAssistant 会话（与 /ask 独立）。
 * 回车或点「问问小影」在面板内提问，不跳页。
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowLeft, MessageCircle, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isValidAssistantBody } from '@walker/shared';
import { useAssistant } from '../../hooks/useAssistant';
import type { SearchHit } from '../../shared/search-content';
import { AssistantThread } from './AssistantThread';

export type SearchModalProps = {
  open: boolean;
  query: string;
  hits: SearchHit[];
  note: string;
  seedAsk?: string | null;
  returnFocusTarget?: HTMLElement | null;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onSeedAskConsumed?: () => void;
};

export function SearchModal({
  open,
  query,
  hits,
  note,
  seedAsk,
  returnFocusTarget,
  onClose,
  onQueryChange,
  onSeedAskConsumed,
}: SearchModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const assistantInputRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'search' | 'assistant'>('search');
  const [draft, setDraft] = useState('');
  const { messages, loading, streaming, error, send, stop, reset } =
    useAssistant();

  useEffect(() => {
    if (!open) {
      setMode('search');
      stop();
      return;
    }
    const backdrop = backdropRef.current;
    if (!backdrop) return;

    const returnFocus =
      returnFocusTarget ?? (document.activeElement as HTMLElement | null);
    const parent = backdrop.parentElement;
    const siblings = parent
      ? Array.from(parent.children).filter((child) => child !== backdrop)
      : [];
    const previous = siblings.map((element) => ({
      element: element as HTMLElement,
      inert: (element as HTMLElement).inert,
      ariaHidden: element.getAttribute('aria-hidden'),
    }));

    for (const { element } of previous) {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    }
    inputRef.current?.focus();

    return () => {
      for (const item of previous) {
        item.element.inert = item.inert;
        if (item.ariaHidden === null) item.element.removeAttribute('aria-hidden');
        else item.element.setAttribute('aria-hidden', item.ariaHidden);
      }
      returnFocus?.focus();
    };
  }, [open, returnFocusTarget, stop]);

  const ask = (text: string) => {
    if (!isValidAssistantBody(text)) return;
    setMode('assistant');
    void send(text);
  };

  // 切到对话视图后把焦点带进对话输入框
  useEffect(() => {
    if (!open || mode !== 'assistant') return;
    const timer = window.setTimeout(() => {
      assistantInputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [open, mode]);

  useEffect(() => {
    if (!open || !seedAsk || !isValidAssistantBody(seedAsk)) return;
    ask(seedAsk);
    onSeedAskConsumed?.();
  }, [open, seedAsk]);

  if (!open) return null;

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]',
      ),
    ).filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={backdropRef}
      className="search-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-dialog-title"
      onClick={onClose}
      onKeyDown={trapFocus}
    >
      <div
        className={`search-panel panel-glass${mode === 'assistant' ? ' is-assistant' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="xiaoying-dialog-companion">
          <XiaoyingPet
            variant="companion"
            activity={getPetActivity(
              loading,
              error,
              mode === 'assistant' ? messages : [],
              mode === 'assistant' ? Boolean(draft.trim()) : false,
              mode === 'search' && Boolean(query.trim()),
            )}
          />
        </div>
        {mode === 'assistant' ? (
          <>
            <div className="search-panel-head">
              <h2 id="search-dialog-title">问小影</h2>
              <button type="button" aria-label="关闭" onClick={onClose}>
                <X size={20} aria-hidden />
              </button>
            </div>
            <div className="search-assistant-bar">
              <button
                type="button"
                className="search-assistant-back"
                onClick={() => {
                  setMode('search');
                  inputRef.current?.focus();
                }}
              >
                <ArrowLeft size={14} aria-hidden />
                返回搜索
              </button>
              {messages.length ? (
                <button
                  type="button"
                  className="search-assistant-back"
                  onClick={() => {
                    reset();
                    setDraft('');
                  }}
                >
                  新对话
                </button>
              ) : null}
            </div>
            <AssistantThread
              draft={draft}
              draftOk={isValidAssistantBody(draft)}
              loading={loading}
              streaming={streaming}
              error={error}
              messages={messages}
              onDraftChange={setDraft}
              onSubmit={() => ask(draft)}
              onAskExample={(text) => ask(text)}
              onStop={stop}
              idPrefix="search-assistant"
              compact
              inputRef={assistantInputRef}
            />
          </>
        ) : (
          <>
            <div className="search-panel-head">
              <h2 id="search-dialog-title">搜索或问小影</h2>
              <button type="button" aria-label="关闭搜索" onClick={onClose}>
                <X size={20} aria-hidden />
              </button>
            </div>
            <input
              ref={inputRef}
              autoFocus
              placeholder="搜索或问小影…（⌘K）"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  ask(query);
                }
              }}
            />
            {note ? (
              <p className="meta">
                {note}
                {note === '无结果' && isValidAssistantBody(query) ? (
                  <>—— 试试下面问问小影</>
                ) : null}
              </p>
            ) : null}
            {isValidAssistantBody(query) ? (
              <button
                type="button"
                className="search-ask-row"
                onClick={() => ask(query)}
              >
                <MessageCircle size={15} aria-hidden />
                <span>
                  问问小影：<strong>{query.trim()}</strong>
                </span>
              </button>
            ) : null}
            <ul className="post-list">
              {hits.map((h) => (
                <li key={h.url}>
                  <Link to={h.url} onClick={onClose}>
                    {h.title}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
