/**
 * SearchModal — 原生 <dialog closedby="any"> 统一 Omni-Bar（秒搜 + 原地问小影 + AI 无声降级）。
 * 彻底移除内部第二个 3D WebGL 桌宠；遵循原生 top-layer 对话框规范（无冗余 role/aria-modal/body 锁滚）。
 */
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { ArrowLeft, CornerDownLeft, MessageCircle, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { isValidAssistantBody } from '@walker/shared';
import { useAssistant } from '../../hooks/useAssistant';
import { trackWebEvent } from '../../lib/web-telemetry';
import { WEB_ROUTES } from '../../shared/routes';
import { resolveSearchBackend } from '../../shared/search-backend';
import type { SearchHit } from '../../shared/search-content';

const AssistantThread = lazy(() =>
  import('./AssistantThread').then((m) => ({ default: m.AssistantThread })),
);

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
  onCompositionChange?: (composing: boolean) => void;
};

export function SearchModal({
  open,
  query,
  hits,
  note,
  seedAsk,
  onClose,
  onQueryChange,
  onSeedAskConsumed,
  onCompositionChange,
}: SearchModalProps) {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const assistantInputRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'search' | 'assistant'>('search');
  const [draft, setDraft] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [lastAsked, setLastAsked] = useState('');
  const [fallbackHits, setFallbackHits] = useState<SearchHit[]>([]);
  const { messages, loading, streaming, error, send, stop, reset } = useAssistant();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      }
      setSelectedIndex(-1);
      window.setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }

    setMode('search');
    setSelectedIndex(-1);
    setFallbackHits([]);
    stop();
    if (dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open, stop]);

  useEffect(() => {
    if (!open || 'closedBy' in HTMLDialogElement.prototype) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let pressedOutside = false;
    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) dialog.close();
    };
    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('pointerup', onUp);
    return () => {
      dialog.removeEventListener('pointerdown', onDown);
      dialog.removeEventListener('pointerup', onUp);
    };
  }, [open]);

  const ask = (text: string) => {
    const trimmed = text.trim();
    if (!isValidAssistantBody(trimmed)) return;
    trackWebEvent('web.omnibar_escalated_to_ai', {
      hasHits: hits.length > 0,
      queryLength: trimmed.length,
    });
    setLastAsked(trimmed);
    setFallbackHits([]);
    setMode('assistant');
    void send(trimmed);
  };

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

  useEffect(() => {
    if (mode !== 'assistant' || !error || !lastAsked) {
      setFallbackHits([]);
      return;
    }
    trackWebEvent('web.ai_graceful_degraded', {
      surface: 'omnibar',
      code: 'assistant-error',
    });
    let cancelled = false;
    void resolveSearchBackend().then(async (backend) => {
      const results = await backend.search(lastAsked, 4);
      if (!cancelled) setFallbackHits(results);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, error, lastAsked]);

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown') {
      if (!hits.length) return;
      event.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % hits.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      if (!hits.length) return;
      event.preventDefault();
      setSelectedIndex((prev) => (prev <= 0 ? hits.length - 1 : prev - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (selectedIndex >= 0 && hits[selectedIndex]) {
        onClose();
        navigate(hits[selectedIndex].url);
        return;
      }
      ask(query);
    }
  };

  const handleDialogClose = () => {
    const dialog = dialogRef.current;
    if (dialog) dialog.returnValue = '';
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className={`omnibar-dialog surface-l2${mode === 'assistant' ? ' is-assistant' : ''}`}
      aria-labelledby="search-dialog-title"
      onClose={handleDialogClose}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      {open ? (
        <div className="omnibar-shell">
          <div className="search-panel-head">
            <div className="omnibar-title-group">
              <img
                src="/xiaoying/poster.jpg"
                alt=""
                aria-hidden="true"
                className="omnibar-avatar"
                width={26}
                height={26}
              />
              <h2 id="search-dialog-title">
                {mode === 'assistant' ? '问小影' : '搜索或问小影'}
              </h2>
            </div>
            <button
              type="button"
              className="omnibar-close-btn"
              aria-label={mode === 'assistant' ? '关闭' : '关闭搜索'}
              onClick={() => dialogRef.current?.close()}
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          {mode === 'assistant' ? (
            <>
              <div className="search-assistant-bar">
                <button
                  type="button"
                  className="search-assistant-back"
                  onClick={() => {
                    setMode('search');
                    window.setTimeout(() => inputRef.current?.focus(), 0);
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

              <Suspense fallback={<p className="meta">正在准备对话…</p>}>
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
              </Suspense>

              {error ? (
                <div className="omnibar-degrade" role="region" aria-label="站内兜底建议">
                  {fallbackHits.length > 0 ? (
                    <ul className="post-list is-compact">
                      {fallbackHits.map((item) => (
                        <li key={item.url}>
                          <Link to={item.url} onClick={() => dialogRef.current?.close()}>
                            {item.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="omnibar-degrade-actions">
                    {lastAsked ? (
                      <Link
                        to={`${WEB_ROUTES.ask}?q=${encodeURIComponent(lastAsked)}`}
                        className="btn-ghost"
                        onClick={() => dialogRef.current?.close()}
                      >
                        用规则版拆解下一步
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => ask(lastAsked)}
                    >
                      重试
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <input
                ref={inputRef}
                type="text"
                role="searchbox"
                inputMode="search"
                className="omnibar-input"
                autoFocus
                placeholder="搜索或问小影…（⌘K）"
                value={query}
                onCompositionStart={() => onCompositionChange?.(true)}
                onCompositionEnd={(e) => {
                  onCompositionChange?.(false);
                  onQueryChange(e.currentTarget.value);
                }}
                onChange={(e) => {
                  setSelectedIndex(-1);
                  onQueryChange(e.target.value);
                }}
                onKeyDown={handleSearchKeyDown}
              />

              {note ? (
                <p className="meta omnibar-note">
                  {note}
                  {note === '无结果' && isValidAssistantBody(query) ? (
                    <>—— 回车直接问小影</>
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
                  <CornerDownLeft size={13} className="omnibar-enter-hint" aria-hidden />
                </button>
              ) : null}

              {hits.length > 0 ? (
                <ul className="post-list omnibar-hits" role="listbox" aria-label="站内匹配结果">
                  {hits.map((h, idx) => (
                    <li
                      key={h.url}
                      className={idx === selectedIndex ? 'is-selected' : undefined}
                    >
                      <Link to={h.url} onClick={() => dialogRef.current?.close()}>
                        {h.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </dialog>
  );
}
