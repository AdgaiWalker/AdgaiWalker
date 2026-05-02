import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

interface ConceptFilter {
  id: string;
  title: string;
  symbol?: string;
  contentCount: number;
}

interface LogFilterIslandProps {
  tags: string[];
  concepts: ConceptFilter[];
  total: number;
}

interface FilterState {
  tag: string | null;
  concept: string | null;
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readFilterFromUrl(): FilterState {
  if (typeof window === 'undefined') {
    return { tag: null, concept: null };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    tag: params.get('tag'),
    concept: params.get('concept'),
  };
}

function writeFilterToUrl(filter: FilterState) {
  const params = new URLSearchParams();
  if (filter.tag) params.set('tag', filter.tag);
  if (filter.concept) params.set('concept', filter.concept);
  const query = params.toString();
  window.history.pushState({}, '', query ? `/log?${query}` : '/log');
}

function getPillClass(active: boolean, variant: 'tag' | 'concept' | 'clear', tag?: string) {
  if (variant === 'clear') {
    return [
      'no-underline font-heading text-sm tracking-wider px-4 py-1.5 rounded-full transition-all duration-300',
      active
        ? 'bg-gold/20 text-gold shadow-sm shadow-gold/20'
        : 'text-mist-light/50 hover:text-parchment/70',
    ].join(' ');
  }

  if (variant === 'concept') {
    return [
      'no-underline text-xs px-3 py-1.5 rounded-full border transition-all duration-300',
      active
        ? 'bg-gold/15 border-gold/35 text-gold shadow-sm shadow-gold/10'
        : 'border-mist/10 text-parchment/40 hover:text-parchment/70 hover:border-gold/20 hover:bg-sea-light/15',
    ].join(' ');
  }

  return [
    'no-underline font-heading text-sm tracking-wider px-3 py-1.5 rounded-full transition-all duration-300',
    active
      ? tag === '哲学'
        ? 'bg-gold text-sea-deep shadow-sm shadow-gold/30'
        : 'bg-parchment/10 text-parchment shadow-sm shadow-parchment/10'
      : tag === '哲学'
        ? 'text-gold/50 hover:text-gold hover:bg-gold/10'
        : 'text-mist-light/40 hover:text-parchment/60 hover:bg-sea-light/20',
  ].join(' ');
}

export function LogFilterIsland({ tags, concepts, total }: LogFilterIslandProps): ReactElement {
  const [filter, setFilter] = useState<FilterState>({ tag: null, concept: null });

  const conceptTitleById = useMemo(() => {
    return new Map(concepts.map((concept) => [concept.id, concept.title]));
  }, [concepts]);

  useEffect(() => {
    setFilter(readFilterFromUrl());

    function handlePopstate() {
      setFilter(readFilterFromUrl());
    }

    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, []);

  useEffect(() => {
    const entries = [...document.querySelectorAll<HTMLElement>('[data-log-entry]')];
    const periods = [...document.querySelectorAll<HTMLElement>('[data-log-period]')];
    const summary = document.getElementById('log-summary');
    const emptyState = document.getElementById('log-empty');
    let visibleCount = 0;

    for (const entry of entries) {
      const entryTags = parseList(entry.dataset.tags);
      const entryConcepts = parseList(entry.dataset.concepts);
      const visible =
        (!filter.tag || entryTags.includes(filter.tag)) &&
        (!filter.concept || entryConcepts.includes(filter.concept));

      entry.hidden = !visible;
      if (visible) visibleCount += 1;
    }

    for (const period of periods) {
      period.hidden = !period.querySelector('[data-log-entry]:not([hidden])');
    }

    if (summary) {
      const conceptTitle = filter.concept ? conceptTitleById.get(filter.concept) ?? filter.concept : '';
      summary.textContent = filter.concept
        ? `${visibleCount} 条记录，连接到「${conceptTitle}」`
        : filter.tag
          ? `${visibleCount} 条记录，带有「${filter.tag}」标签`
          : `${total} 条记录，随时间漂流`;
    }

    emptyState?.classList.toggle('hidden', visibleCount > 0);
  }, [conceptTitleById, filter, total]);

  function selectFilter(nextFilter: FilterState) {
    setFilter(nextFilter);
    writeFilterToUrl(nextFilter);
  }

  return (
    <div className="mb-16 relative">
      <div className="flex flex-wrap gap-3 items-center justify-center">
        <a
          href="/log"
          className={getPillClass(!filter.tag && !filter.concept, 'clear')}
          onClick={(event) => {
            event.preventDefault();
            selectFilter({ tag: null, concept: null });
          }}
        >
          全部海域
        </a>

        <span className="text-mist/20 select-none">·</span>

        {tags.map((tag, index) => (
          <span key={tag} className="contents">
            <a
              href={`/log?tag=${encodeURIComponent(tag)}`}
              className={getPillClass(filter.tag === tag, 'tag', tag)}
              onClick={(event) => {
                event.preventDefault();
                selectFilter({ tag, concept: null });
              }}
            >
              {tag}
            </a>
            {index < tags.length - 1 && <span className="text-mist/10 select-none">·</span>}
          </span>
        ))}
      </div>

      {concepts.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="h-px w-10 bg-gold/10" />
            <span className="text-xs text-mist/45 font-heading tracking-[0.2em] uppercase">按概念进入</span>
            <div className="h-px w-10 bg-gold/10" />
          </div>

          <div className="flex flex-wrap gap-2 items-center justify-center">
            {concepts.map((concept) => (
              <a
                key={concept.id}
                href={`/log?concept=${encodeURIComponent(concept.id)}`}
                className={getPillClass(filter.concept === concept.id, 'concept')}
                onClick={(event) => {
                  event.preventDefault();
                  selectFilter({ tag: null, concept: concept.id });
                }}
              >
                {concept.symbol && <span className="mr-1 text-gold/70">{concept.symbol}</span>}
                {concept.title}
                <span className="ml-1 text-mist/50">{concept.contentCount}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
