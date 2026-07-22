/**
 * TOC 高亮 — 根据标题 DOM 位置解析 active id。
 * 依赖：resolveActiveTocId；调用方传入 toc id 列表。
 */
import { useEffect, useState } from 'react';
import { resolveActiveTocId } from '../shared/article-outline';

export function useTocActive(ids: readonly string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    if (ids.length === 0 || typeof window === 'undefined') {
      setActiveId(null);
      return;
    }

    const update = () => {
      const tops = ids.map((id) => {
        const node = document.getElementById(id);
        if (!node) return Number.POSITIVE_INFINITY;
        return node.getBoundingClientRect().top + window.scrollY;
      });
      setActiveId(resolveActiveTocId(window.scrollY, tops, ids));
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ids]);

  return activeId;
}
