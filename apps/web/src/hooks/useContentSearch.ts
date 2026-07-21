/**
 * useContentSearch — 壳/容器侧：查询状态 + 防抖搜索 + miss 上报
 */
import { useEffect, useState } from 'react';
import { publicApi } from '../api/public-api';
import { getAllItems } from '../content';
import {
  searchContentItems,
  type SearchHit,
} from '../shared/search-content';

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

    const timer = window.setTimeout(() => {
      const next = searchContentItems(getAllItems(), query, 12);
      setHits(next);
      setNote(next.length ? '' : '无结果');
      if (!next.length) {
        void publicApi.searchMiss(query).catch(() => {});
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [open, query]);

  return {
    query,
    hits,
    note,
    onQueryChange: setQuery,
  };
}
