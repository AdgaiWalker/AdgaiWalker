/**
 * MobileBar — 内页移动顶栏
 */
import { Link } from 'react-router-dom';
import { Menu, Search } from 'lucide-react';
import { dualEntry } from '../../shared/dual-entry';

type Props = {
  onToggleMenu: () => void;
  onOpenSearch: () => void;
};

export function MobileBar({ onToggleMenu, onOpenSearch }: Props) {
  return (
    <div className="mobile-bar surface-l1">
      <button type="button" aria-label="菜单" onClick={onToggleMenu}>
        <Menu size={20} />
      </button>
      <Link
        to="/"
        style={{ fontWeight: 700, color: 'var(--color-parchment)', textDecoration: 'none' }}
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
