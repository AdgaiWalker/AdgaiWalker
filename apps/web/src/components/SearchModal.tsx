import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAllItems } from '../content';

interface Hit {
  url: string;
  title: string;
}

export function SearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !q.trim()) {
      setHits([]);
      setNote('');
      return;
    }
    const lower = q.toLowerCase();
    const local = getAllItems()
      .filter(
        (i) =>
          i.title.toLowerCase().includes(lower) ||
          i.summary.toLowerCase().includes(lower) ||
          i.body.toLowerCase().includes(lower),
      )
      .slice(0, 12)
      .map((i) => ({
        url: `/posts/${encodeURIComponent(i.slug)}`,
        title: i.title,
      }));
    setHits(local);
    setNote(local.length ? '' : '无结果');
    if (!local.length) {
      void fetch('/api/search-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, hadResults: false }),
      }).catch(() => {});
    }
  }, [q, open]);

  if (!open) return null;

  return (
    <div className="search-backdrop" role="dialog" aria-modal="true" aria-label="搜索" onClick={onClose}>
      <div className="search-panel panel-glass" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="搜索标题或正文…（⌘K）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
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
