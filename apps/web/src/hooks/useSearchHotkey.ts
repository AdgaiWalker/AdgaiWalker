/**
 * useSearchHotkey — ⌘K / Ctrl+K 打开搜索（DOM 监听留在 hook，不进展示块）
 */
import { useEffect } from 'react';

export function useSearchHotkey(onOpen: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpen]);
}
