/**
 * EntryList — 纸页条目行：标题 · 右侧等宽元信息 ·（可选）一行简述。
 * 全站列表（首页三章、文章目录、相连、上下篇）共用这一种形态。
 */
import { Link } from 'react-router-dom';
import { dualEntry } from '../../shared/dual-entry';
import { parseIsoDate } from '../../shared/format';

export type Entry = {
  slug: string;
  title: string;
  date: string;
  summary?: string;
};

type Props<T extends Entry> = {
  items: readonly T[];
  /** 是否显示一行简述 */
  withSummary?: boolean;
  /** 右侧元信息；默认 MM.DD */
  meta?: (item: T) => string;
  label?: string;
};

export function shortDate(iso: string): string {
  const d = parseIsoDate(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function postHref(slug: string): string {
  return `${dualEntry.browse.path}/${encodeURIComponent(slug)}`;
}

export function EntryList<T extends Entry>({ items, withSummary = false, meta, label }: Props<T>) {
  if (items.length === 0) return null;
  return (
    <ul className="entry-list" aria-label={label}>
      {items.map((item) => (
        <li key={item.slug}>
          <Link to={postHref(item.slug)} className="entry">
            <span className="entry-title">{item.title}</span>
            <span className="entry-meta">{meta ? meta(item) : shortDate(item.date)}</span>
            {withSummary && item.summary ? <span className="entry-dek">{item.summary}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
