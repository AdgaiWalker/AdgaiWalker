import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { PromptItem } from '../../utils/prompts';

interface ConceptLink {
  id: string;
  title: string;
  symbol?: string;
}

interface PromptCardIslandProps {
  prompt: PromptItem;
  concepts: ConceptLink[];
}

export function PromptCardIsland({ prompt, concepts }: PromptCardIslandProps): ReactElement {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  async function copyPrompt() {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }

    try {
      await navigator.clipboard.writeText(prompt.content);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }

    resetTimerRef.current = window.setTimeout(() => {
      setCopyState('idle');
      resetTimerRef.current = null;
    }, 1800);
  }

  const copyLabel = copyState === 'copied'
    ? '已复制'
    : copyState === 'failed'
      ? '复制失败'
      : '复制';

  return (
    <article className="prompt-card group relative overflow-hidden rounded-2xl border border-gold/15 bg-[linear-gradient(135deg,rgba(212,175,55,0.08),rgba(19,32,64,0.35)_42%,rgba(10,22,40,0.75))] p-5 shadow-xl shadow-sea-deep/20">
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gold/10 blur-2xl transition-opacity duration-300 group-hover:opacity-80" />

      <header className="relative mb-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[10px] font-heading uppercase tracking-[0.24em] text-gold/55">Prompt</span>
          <button
            type="button"
            className="rounded-full border border-gold/20 bg-sea-deep/40 px-3 py-1 text-xs font-mono text-gold/55 transition-colors hover:border-gold/40 hover:text-gold"
            onClick={copyPrompt}
          >
            {copyLabel}
          </button>
        </div>

        <h3 className="font-heading text-lg leading-snug text-parchment group-hover:text-gold transition-colors">
          {prompt.title}
        </h3>

        <a href={prompt.sourceUrl} className="mt-2 inline-block text-xs text-parchment/35 no-underline transition-colors hover:text-gold/70">
          来源：{prompt.sourceTitle}
        </a>
      </header>

      <pre className="prompt-card-content relative max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-mist/10 bg-sea-deep/55 p-4 font-mono text-sm leading-relaxed text-parchment/78">
        <code>{prompt.content}</code>
      </pre>

      <footer className="relative mt-4 flex flex-col gap-3">
        {prompt.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {prompt.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-sea-light/30 px-2 py-0.5 text-xs text-mist-light/65">
                {tag}
              </span>
            ))}
          </div>
        )}

        {concepts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {concepts.map((concept) => (
              <a
                key={concept.id}
                href={`/concept/${concept.id}`}
                className="rounded-full border border-gold/15 bg-gold/5 px-2 py-0.5 text-xs text-gold/65 no-underline transition-colors hover:border-gold/35 hover:text-gold"
              >
                {concept.symbol && <span className="mr-1">{concept.symbol}</span>}
                {concept.title}
              </a>
            ))}
          </div>
        )}
      </footer>
    </article>
  );
}
