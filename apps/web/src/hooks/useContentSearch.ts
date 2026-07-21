/**
 * useContentSearch — 壳/容器侧：查询状态 + 规则搜索 + miss 上报
 */
import { useEffect, useState } from 'react';
import { publicApi } from '../api/public-api';
import { getAllItems } from '../content';
import {
  searchContentItems,
  type SearchHit,
} from '../shared/search-content';

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
    const next = searchContentItems(getAllItems(), query, 12);
    setHits(next);
    setNote(next.length ? '' : '无结果');
    if (!next.length) {
      void publicApi.searchMiss(query).catch(() => {});
    }
  }, [open, query]);

  return {
    query,
    hits,
    note,
    onQueryChange: setQuery,
  };
}
