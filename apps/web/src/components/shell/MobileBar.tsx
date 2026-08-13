/**
 * MobileBar — 内页移动顶栏
 * 阅读模式：← 证据 回逛（与桌面 chrome 同路径语义）
 */
import type { RefObject } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Menu } from 'lucide-react';
import { dualEntry } from '../../shared/dual-entry';

type Props = {
  onToggleMenu: () => void;
  onOpenSearch: (trigger?: HTMLElement) => void;
  searchOpen?: boolean;
  menuOpen?: boolean;
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
  inactive?: boolean;
  reading?: boolean;
  /** 阅读页返回逛的完整 href（可含 ?type=） */
  browseHref?: string;
};

export function MobileBar({
  onToggleMenu,
  onOpenSearch,
  searchOpen = false,
  menuOpen = false,
  menuButtonRef,
  inactive = false,
  reading = false,
  browseHref = dualEntry.browse.path,
}: Props) {
  if (reading) {
    return (
      <div
        className="mobile-bar surface-l1 is-reading-bar"
        inert={inactive}
        aria-hidden={inactive || undefined}
      >
        <Link
          to={browseHref}
          className="reading-mobile-back"
          aria-label={`返回${dualEntry.browse.title}`}
        >
          <ArrowLeft size={18} aria-hidden />
          <span>{dualEntry.browse.title}</span>
        </Link>
        <button
          type="button"
          className="btn-ghost"
          aria-haspopup="dialog"
          aria-expanded={searchOpen}
          onClick={(event) => onOpenSearch(event.currentTarget)}
        >
          搜索
        </button>
      </div>
    );
  }

  return (
    <div
      className="mobile-bar surface-l1"
      inert={inactive}
      aria-hidden={inactive || undefined}
    >
      <button
        ref={menuButtonRef}
        type="button"
        aria-label="菜单"
        aria-controls="app-sidebar"
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
      >
        <Menu size={20} />
      </button>
      <Link
        to="/"
        className="mobile-bar-brand"
      >
        Walker
      </Link>
      <Link
        to={dualEntry.ask.path}
        className="btn-primary mobile-bar-cta"
      >
        卡住了
      </Link>
      <button
        type="button"
        className="btn-ghost"
        aria-haspopup="dialog"
        aria-expanded={searchOpen}
        onClick={(event) => onOpenSearch(event.currentTarget)}
      >
        搜索
      </button>
    </div>
  );
}
