/**
 * MobileBar — 内页移动顶栏
 * 阅读模式：← 证据 回逛（与桌面 chrome 同路径语义）
 */
import { Link } from 'react-router-dom';
import { ArrowLeft, Menu } from 'lucide-react';
import { dualEntry } from '../../shared/dual-entry';

type Props = {
  onToggleMenu: () => void;
  onOpenSearch: () => void;
  reading?: boolean;
  /** 阅读页返回逛的完整 href（可含 ?type=） */
  browseHref?: string;
};

export function MobileBar({
  onToggleMenu,
  onOpenSearch,
  reading = false,
  browseHref = dualEntry.browse.path,
}: Props) {
  if (reading) {
    return (
      <div className="mobile-bar surface-l1 is-reading-bar">
        <Link
          to={browseHref}
          className="reading-mobile-back"
          aria-label={`返回${dualEntry.browse.title}`}
        >
          <ArrowLeft size={18} aria-hidden />
          <span>{dualEntry.browse.title}</span>
        </Link>
        <button type="button" className="btn-ghost" onClick={onOpenSearch}>
          搜索
        </button>
      </div>
    );
  }

  return (
    <div className="mobile-bar surface-l1">
      <button type="button" aria-label="菜单" onClick={onToggleMenu}>
        <Menu size={20} />
      </button>
      <Link
        to="/"
        style={{
          fontWeight: 700,
          color: 'var(--color-parchment)',
          textDecoration: 'none',
        }}
      >
        Walker
      </Link>
      <Link
        to={dualEntry.ask.path}
        className="btn-primary"
        style={{ marginLeft: 'auto', padding: '0.4rem 0.85rem', minHeight: 36 }}
      >
        {dualEntry.ask.shortCta}
      </Link>
      <button type="button" className="btn-ghost" onClick={onOpenSearch}>
        搜索
      </button>
    </div>
  );
}
