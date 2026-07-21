/**
 * SearchModal — 展示块：搜索对话框 UI（无 content 扫描 / 无 API / 无 document 监听）
 */
import { Link } from 'react-router-dom';
import type { SearchHit } from '../../shared/search-content';

export type SearchModalProps = {
  open: boolean;
  query: string;
  hits: SearchHit[];
  note: string;
  onClose: () => void;
  onQueryChange: (query: string) => void;
};

export function SearchModal({
  open,
  query,
  hits,
  note,
  onClose,
  onQueryChange,
}: SearchModalProps) {
  if (!open) return null;

  return (
    <div
      className="search-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="搜索"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="search-panel panel-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <input
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
