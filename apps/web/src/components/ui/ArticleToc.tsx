/**
 * 文章目录展示块 — 只渲染 TOC 与点击跳转，不含滚动测量。
 */
import { ListTree } from 'lucide-react';
import type { TocItem } from '../../shared/article-outline';

export type ArticleTocProps = {
  items: readonly TocItem[];
  activeId: string | null;
  onNavigate?: (id: string) => void;
};

export function ArticleToc({ items, activeId, onNavigate }: ArticleTocProps) {
  if (items.length === 0) return null;

  return (
    <nav className="surface-l2 article-toc" aria-label="文章目录">
      <p
        className="meta"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          margin: '0 0 0.5rem',
        }}
      >
        <ListTree size={14} aria-hidden />
        目录
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li
              key={item.id}
              style={{
                marginLeft: item.level === 3 ? '0.75rem' : 0,
                marginBottom: 4,
              }}
            >
              <a
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate?.(item.id);
                  document
                    .getElementById(item.id)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                style={{
                  color: active
                    ? 'var(--color-accent, #2d6a4f)'
                    : 'var(--color-parchment-dim, inherit)',
                  fontWeight: active ? 600 : 400,
                  fontSize: '0.875rem',
                  textDecoration: 'none',
                }}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
