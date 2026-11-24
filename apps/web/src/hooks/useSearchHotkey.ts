/**
 * useSearchHotkey — ⌘K / Ctrl+K 打开统一 Omni-Bar。
 */
import { useEffect } from 'react';

export function useSearchHotkey(onOpen: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpen, enabled]);
}
