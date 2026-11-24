/**
 * useContentSearch — 壳侧搜索：IME 组词守卫 + 防抖查询 + 真实漏搜上报（屏蔽拼音残片）。
 * 依赖：search-backend（Pagefind 或延迟加载的本地列表）。
 */
import { useEffect, useState } from 'react';
import { publicApi } from '../api/public-api';
import { resolveSearchBackend } from '../shared/search-backend';
import type { SearchHit } from '../shared/search-content';

const DEBOUNCE_MS = 280;
const PINYIN_FRAGMENT_RE = /^[a-z]+'[a-z']+$/i;

export function shouldRecordSearchMiss(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length < 2) return false;
  if (PINYIN_FRAGMENT_RE.test(trimmed)) return false;
  return true;
}

export function useContentSearch(open: boolean, composing = false) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery('');
      setHits([]);
      setNote('');
    }
  }, [open]);

  useEffect(() => {
    if (!open || composing) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setHits([]);
      setNote('');
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const backend = await resolveSearchBackend();
        const next = await backend.search(trimmed, 12);
        if (cancelled) return;
        setHits(next);
        setNote(next.length ? '' : '无结果');
        if (!next.length && shouldRecordSearchMiss(trimmed)) {
          void publicApi.searchMiss(trimmed).catch(() => {});
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, composing]);

  return {
    query,
    hits,
    note,
    onQueryChange: setQuery,
  };
}
