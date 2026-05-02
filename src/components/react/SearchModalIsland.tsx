import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

interface PagefindSearchResult {
  data(): Promise<{
    url: string;
    excerpt?: string;
    meta?: {
      title?: string;
    };
  }>;
}

interface PagefindApi {
  init(): Promise<void>;
  search(query: string): Promise<{
    results: PagefindSearchResult[];
  }>;
}

declare global {
  interface Window {
    pagefind?: PagefindApi;
  }
}

interface SearchResult {
  url: string;
  title: string;
  excerpt: string;
}

function loadPagefindScript(): Promise<PagefindApi | null> {
  if (window.pagefind) return Promise.resolve(window.pagefind);

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-pagefind-script]');
    if (existing) {
      existing.addEventListener('load', async () => {
        if (!window.pagefind) return resolve(null);
        await window.pagefind.init();
        resolve(window.pagefind);
      }, { once: true });
      existing.addEventListener('error', () => resolve(null), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = '/pagefind/pagefind.js';
    script.dataset.pagefindScript = 'true';
    script.onload = async () => {
      if (!window.pagefind) return resolve(null);
      await window.pagefind.init();
      resolve(window.pagefind);
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

export function SearchModalIsland(): ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState('输入关键词，探索这片海域');
  const inputRef = useRef<HTMLInputElement>(null);
  const pagefindRef = useRef<PagefindApi | null>(null);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }

      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';

    if (open) {
      inputRef.current?.focus();
      void loadPagefindScript().then((api) => {
        pagefindRef.current = api;
        if (!api) setStatus('搜索索引暂不可用，请先完成构建');
      });
    } else {
      setQuery('');
      setResults([]);
      setStatus('输入关键词，探索这片海域');
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const value = query.trim();

      if (!value) {
        setResults([]);
        setStatus(pagefindRef.current ? '输入关键词，探索这片海域' : '搜索索引加载中...');
        return;
      }

      const api = pagefindRef.current ?? await loadPagefindScript();
      pagefindRef.current = api;

      if (!api || controller.signal.aborted) {
        setStatus('搜索索引暂不可用，请先完成构建');
        return;
      }

      const searchResults = await api.search(value);
      const resultData = await Promise.all(
        searchResults.results.slice(0, 8).map(async (result) => {
          const data = await result.data();
          return {
            url: data.url,
            title: data.meta?.title ?? data.url,
            excerpt: data.excerpt ?? '',
          };
        })
      );

      if (controller.signal.aborted) return;
      setResults(resultData);
      setStatus(resultData.length === 0 ? `没有找到「${value}」相关的记录` : '');
    }, 200);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query]);

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-2 text-mist-light/50 hover:text-parchment/70 transition-colors text-xs font-heading tracking-wider cursor-pointer bg-transparent border-none"
        aria-label="搜索"
        onClick={() => setOpen(true)}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span className="hidden md:inline">搜索</span>
        <kbd className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded border border-mist/20 text-mist/40 ml-1">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="站内搜索">
          <button
            type="button"
            className="absolute inset-0 bg-sea-deep/80 backdrop-blur-sm cursor-default"
            aria-label="关闭搜索"
            onClick={() => setOpen(false)}
          />

          <div className="relative z-10 max-w-2xl mx-auto mt-[15vh] px-4">
            <div className="rounded-2xl border border-mist/20 bg-sea-mid shadow-2xl shadow-sea-deep/50 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-mist/10">
                <svg className="w-5 h-5 text-gold/50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="在这片海域中搜索..."
                  className="flex-1 bg-transparent border-none outline-none text-parchment text-base font-body placeholder:text-mist/40"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="text-mist/40 hover:text-parchment/60 text-xs px-2 py-1 rounded border border-mist/15 cursor-pointer bg-transparent font-mono"
                  onClick={() => setOpen(false)}
                >
                  ESC
                </button>
              </div>

              <div className="max-h-[50vh] overflow-y-auto px-2 py-2">
                {status && (
                  <div className="py-12 text-center text-mist/40 text-sm">
                    {status}
                  </div>
                )}
                {results.map((result) => (
                  <a
                    key={result.url}
                    href={result.url}
                    className="block px-4 py-3 rounded-lg hover:bg-sea-light/30 transition-colors no-underline group"
                  >
                    <div className="text-parchment text-sm font-heading group-hover:text-gold transition-colors mb-1">
                      {result.title}
                    </div>
                    <p className="text-parchment/40 text-xs line-clamp-2">{result.excerpt}</p>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
