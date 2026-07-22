/**
 * useContentSearch — 壳侧：防抖查询 + miss 上报
 * 依赖：search-backend（Pagefind 或本地列表）
 */
import { useEffect, useState } from 'react';
import { publicApi } from '../api/public-api';
import { resolveSearchBackend } from '../shared/search-backend';
import type { SearchHit } from '../shared/search-content';

const DEBOUNCE_MS = 250;

export function useContentSearch(open: boolean) {
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
    if (!open) return;
    if (!query.trim()) {
      setHits([]);
      setNote('');
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const backend = await resolveSearchBackend();
        const next = await backend.search(query, 12);
        if (cancelled) return;
        setHits(next);
        setNote(next.length ? '' : '无结果');
        if (!next.length) {
          void publicApi.searchMiss(query).catch(() => {});
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  return {
    query,
    hits,
    note,
    onQueryChange: setQuery,
  };
}
