/**
 * 搜索后端抽象 — 优先 Pagefind（生产索引），否则本地 content 列表。
 * 依赖：search-content 纯函数；Pagefind 运行时由 /pagefind/pagefind.js 注入。
 */

import { getAllItems } from '../content';
import {
  searchContentItems,
  type SearchHit,
} from './search-content';

export type SearchBackend = {
  search(query: string, limit?: number): Promise<SearchHit[]>;
};

type PagefindApi = {
  search: (
    query: string,
  ) => Promise<{ results: Array<{ data: () => Promise<{ url: string; meta?: { title?: string } }> }> }>;
};

let pagefindLoad: Promise<PagefindApi | null> | null = null;

async function tryLoadPagefind(): Promise<PagefindApi | null> {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { pagefind?: PagefindApi };
  if (w.pagefind) return w.pagefind;

  try {
    // 仅 dist 部署后 /pagefind/ 存在；开发态失败则本地检索
    const mod = await import(
      /* @vite-ignore */ `${window.location.origin}/pagefind/pagefind.js`
    );
    const api =
      (mod as { default?: PagefindApi }).default ?? (mod as PagefindApi);
    if (api && typeof api.search === 'function') {
      w.pagefind = api;
      return api;
    }
  } catch {
    /* 无索引 */
  }
  return null;
}

function localBackend(): SearchBackend {
  return {
    async search(query: string, limit = 12) {
      return searchContentItems(getAllItems(), query, limit);
    },
  };
}

function pagefindBackend(api: PagefindApi): SearchBackend {
  return {
    async search(query: string, limit = 12) {
      const res = await api.search(query);
      const hits: SearchHit[] = [];
      for (const r of res.results.slice(0, limit)) {
        const data = await r.data();
        const url = data.url.startsWith('/') ? data.url : `/${data.url}`;
        hits.push({
          url: url.replace(/\/$/, '') || url,
          title: data.meta?.title ?? url,
        });
      }
      return hits;
    },
  };
}

/** 解析当前可用搜索实现（每次搜索可复用加载 Promise） */
export async function resolveSearchBackend(): Promise<SearchBackend> {
  if (!pagefindLoad) {
    pagefindLoad = tryLoadPagefind();
  }
  const api = await pagefindLoad;
  return api ? pagefindBackend(api) : localBackend();
}
