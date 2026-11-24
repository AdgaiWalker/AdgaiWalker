/**
 * 阅读进度 — 支持原生 CSS animation-timeline: scroll() 时零 JS 滚动监听；老浏览器退回轻量计算。
 */
import { useEffect, useState } from 'react';
import { computeReadingProgress } from '../shared/article-outline';

export function supportsCssScrollTimeline(): boolean {
  if (typeof window === 'undefined' || typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
    return false;
  }
  return CSS.supports('animation-timeline', 'scroll()');
}

export function useReadingProgress(enabled: boolean): number {
  const [ratio, setRatio] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    if (supportsCssScrollTimeline() && !reduced) return;

    const update = () => {
      const el = document.documentElement;
      setRatio(
        computeReadingProgress(
          window.scrollY,
          window.innerHeight,
          el.scrollHeight,
        ),
      );
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [enabled]);

  return ratio;
}
