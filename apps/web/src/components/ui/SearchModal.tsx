/**
 * SearchModal — 展示块：搜索对话框 UI（无 content 扫描 / 无 API / 无 document 监听）
 */
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SearchHit } from '../../shared/search-content';

export type SearchModalProps = {
  open: boolean;
  query: string;
  hits: SearchHit[];
  note: string;
  returnFocusTarget?: HTMLElement | null;
  onClose: () => void;
  onQueryChange: (query: string) => void;
};

export function SearchModal({
  open,
  query,
  hits,
  note,
  returnFocusTarget,
  onClose,
  onQueryChange,
}: SearchModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open, returnFocusTarget]);

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
        'button:not([disabled]), input:not([disabled]), a[href]',
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
        className="search-panel panel-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="search-panel-head">
          <h2 id="search-dialog-title">搜索</h2>
          <button type="button" aria-label="关闭搜索" onClick={onClose}>
            <X size={20} aria-hidden />
          </button>
        </div>
        <input
          ref={inputRef}
          autoFocus
          placeholder="搜索标题或正文…（⌘K）"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {note ? <p className="meta">{note}</p> : null}
        <ul className="post-list">
          {hits.map((h) => (
            <li key={h.url}>
              <Link to={h.url} onClick={onClose}>
                {h.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
