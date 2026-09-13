/**
 * HeroSearchBar — 首页专属探索中枢（C 位门面）
 * 职责：毛玻璃外观、引导词动态轮播、即点即搜的灵感火花标签（Sparks）。
 */
import { useEffect, useState } from 'react';
import { Search, Sparkles } from 'lucide-react';

const ROTATING_PLACEHOLDERS = [
  '搜索 28+ 篇深度思考，或问小影...',
  '搜搜看：AI 工作流、智能体架构...',
  '问小影：你的核心知识体系是什么？...',
  '搜搜看：Cursor、独立开发、数字花园...',
];

export type SearchSparkItem = {
  label: string;
  query?: string;
  isAsk?: boolean;
};

const DEFAULT_SPARKS: SearchSparkItem[] = [
  { label: '🤖 智能体工作站', query: '智能体' },
  { label: '📐 架构与思考', query: '架构' },
  { label: '💡 数字花园', query: '花园' },
  { label: '✨ 问问小影', query: '你好小影，请介绍一下站点的核心内容', isAsk: true },
];

export type HeroSearchBarProps = {
  onOpen: () => void;
  onQueryChange?: (query: string) => void;
  sparks?: SearchSparkItem[];
};

export function HeroSearchBar({
  onOpen,
  onQueryChange,
  sparks = DEFAULT_SPARKS,
}: HeroSearchBarProps) {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFading(true);
      const nextTimer = window.setTimeout(() => {
        setIndex((prev) => (prev + 1) % ROTATING_PLACEHOLDERS.length);
        setFading(false);
      }, 250);
      return () => window.clearTimeout(nextTimer);
    }, 3800);

    return () => window.clearInterval(timer);
  }, []);

  const handleSparkClick = (item: SearchSparkItem) => {
    if (item.query && onQueryChange) {
      onQueryChange(item.query);
    }
    onOpen();
  };

  return (
    <div className="hero-search-wrapper panel-glass draggable-card pop-in">
      <button
        type="button"
        className="hero-search-input-btn"
        onClick={onOpen}
        aria-label="搜索全站或问小影"
      >
        <Search size={18} className="hero-search-icon" aria-hidden />
        <span
          className={`hero-search-placeholder${fading ? ' is-fading' : ''}`}
        >
          {ROTATING_PLACEHOLDERS[index]}
        </span>
        <kbd className="hero-search-kbd" aria-hidden>
          ⌘K
        </kbd>
      </button>

      <div className="hero-search-sparks" aria-label="探索推荐">
        <span className="hero-search-sparks-label">
          <Sparkles size={12} aria-hidden />
          <span>灵感探索</span>
        </span>
        <div className="hero-search-sparks-list">
          {sparks.map((spark) => (
            <button
              key={spark.label}
              type="button"
              className="hero-search-tag"
              onClick={() => handleSparkClick(spark)}
            >
              {spark.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
