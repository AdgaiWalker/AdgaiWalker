/**
 * MobileBar — 移动端极简壳（阅读模式：顶部返回 + ⌘K；内页：顶部品牌/搜索 + 底部 4 键单手栏）。
 */
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { dualEntry } from '../../shared/dual-entry';
import { primaryNavItems, utilityAboutItem } from '../../shared/nav';
import { WEB_ROUTES } from '../../shared/routes';

type Props = {
  reading?: boolean;
  browseHref?: string;
  searchOpen?: boolean;
  onOpenSearch?: (trigger?: HTMLElement) => void;
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

export function MobileBar({
  reading = false,
  browseHref = dualEntry.browse.path,
  searchOpen = false,
  onOpenSearch,
}: Props) {
  const { pathname } = useLocation();

  if (reading) {
    return (
      <div className="mobile-bar surface-chrome is-reading-bar">
        <Link
          to={browseHref}
          className="reading-mobile-back"
          aria-label={`返回${dualEntry.browse.title}`}
        >
          <ArrowLeft size={18} aria-hidden />
          <span>{dualEntry.browse.title}</span>
        </Link>
        {onOpenSearch ? (
          <button
            type="button"
            className="mobile-bar-icon-btn"
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
            aria-label="搜索或问小影"
            onClick={(e) => onOpenSearch(e.currentTarget)}
          >
            <Search size={17} aria-hidden />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="mobile-bar surface-chrome">
        <Link to={WEB_ROUTES.home} className="mobile-bar-brand">
          Walker
        </Link>
        <div className="mobile-bar-right">
          {onOpenSearch ? (
            <button
              type="button"
              className="mobile-bar-icon-btn"
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
              aria-label="搜索或问小影"
              onClick={(e) => onOpenSearch(e.currentTarget)}
            >
              <Search size={17} aria-hidden />
            </button>
          ) : null}
          <Link to={utilityAboutItem.href} className="mobile-bar-about">
            {utilityAboutItem.label}
          </Link>
        </div>
      </div>

      <nav className="mobile-bottom-nav surface-chrome" aria-label="手机底栏">
        {primaryNavItems.map((item) => {
          const Icon = item.icon;
          const active = isNavActive(item.href, pathname);
          return (
            <NavLink
              key={item.href}
              to={item.href}
              className={`mobile-bottom-item${active ? ' is-active' : ''}`}
            >
              <Icon size={18} aria-hidden />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}
