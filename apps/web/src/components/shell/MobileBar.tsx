/**
 * MobileBar — 内页移动顶栏
 * 阅读模式：← 证据 回逛（与桌面 chrome 同路径语义）
 * 搜索入口在 AppShell 的 AskBar，本栏不再放搜索按钮。
 */
import type { RefObject } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Menu } from 'lucide-react';
import { dualEntry } from '../../shared/dual-entry';
import { WEB_ROUTES } from '../../shared/routes';

type Props = {
  /** 非阅读模式必填；阅读顶栏不用菜单 */
  onToggleMenu?: () => void;
  menuOpen?: boolean;
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
  inactive?: boolean;
  reading?: boolean;
  /** 阅读页返回逛的完整 href（可含 ?type=） */
  browseHref?: string;
};

export function MobileBar({
  onToggleMenu,
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
        to={WEB_ROUTES.home}
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
    </div>
  );
}
