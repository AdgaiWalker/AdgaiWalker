/**
 * TopNav — 桌面端 48px 极简悬浮顶栏（Walker + 4 主入口 + Omni-Bar ⌘K + 关于）。
 */
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
import { dualEntry } from '../../shared/dual-entry';
import { primaryNavItems, utilityAboutItem } from '../../shared/nav';
import { WEB_ROUTES } from '../../shared/routes';

type Props = {
  searchOpen: boolean;
  onOpenSearch: (trigger?: HTMLElement) => void;
};

function isNavActive(href: string, pathname: string): boolean {
  if (href === dualEntry.browse.path) {
    return (
      pathname === dualEntry.browse.path ||
      pathname.startsWith(`${dualEntry.browse.path}/`)
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav({ searchOpen, onOpenSearch }: Props) {
  const { pathname } = useLocation();
  const aboutActive =
    pathname === utilityAboutItem.href ||
    pathname === WEB_ROUTES.about ||
    pathname === WEB_ROUTES.gear;

  return (
    <header className="top-nav surface-chrome">
      <div className="top-nav-inner">
        <Link to={WEB_ROUTES.home} className="top-nav-brand">
          Walker
        </Link>

        <nav className="top-nav-links" aria-label="站内">
          {primaryNavItems.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item.href, pathname);
            return (
              <NavLink
                key={item.href}
                to={item.href}
                className={`top-nav-link${active ? ' is-active' : ''}`}
              >
                <Icon size={14} aria-hidden />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="top-nav-actions">
          <button
            type="button"
            className="top-nav-search"
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
            aria-label="搜索或问小影"
            onClick={(e) => onOpenSearch(e.currentTarget)}
          >
            <Search size={14} aria-hidden />
            <span>搜文章或问小影</span>
            <kbd aria-hidden>⌘K</kbd>
          </button>
          <Link
            to={utilityAboutItem.href}
            className={`top-nav-about${aboutActive ? ' is-active' : ''}`}
          >
            {utilityAboutItem.label}
          </Link>
        </div>
      </div>
    </header>
  );
}
