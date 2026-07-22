/**
 * 阅读进度 — 监听滚动，调用 computeReadingProgress。
 */
import { useEffect, useState } from 'react';
import { computeReadingProgress } from '../shared/article-outline';

export function useReadingProgress(enabled: boolean): number {
  const [ratio, setRatio] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

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
