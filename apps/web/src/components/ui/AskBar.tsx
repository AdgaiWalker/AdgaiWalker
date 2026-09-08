/**
 * AskBar — 右下角常驻搜索入口：搜索框样式，点击唤起「搜索或问小影」面板。
 * 由 AppShell 挂载；/ask 页不挂（整页对话已是入口）。
 */
import { Search } from 'lucide-react';

export function AskBar({
  onOpen,
  open = false,
}: {
  onOpen: (trigger?: HTMLElement) => void;
  open?: boolean;
}) {
  return (
    <button
      type="button"
      className="askbar-fab"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label="搜索或问小影"
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <Search size={15} aria-hidden />
      <span className="askbar-fab-text">搜索或问小影</span>
      <kbd className="askbar-fab-kbd" aria-hidden>
        ⌘K
      </kbd>
    </button>
  );
}
