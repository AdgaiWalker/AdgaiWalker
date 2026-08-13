/**
 * AppSidebar — 读 / 拿 / 实验 / 关于；支持 nav children 二级
 */
import type { RefObject } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Code2,
  Mail,
  MessageCircleQuestion,
  Rss,
  Search,
  X,
} from 'lucide-react';
import { SITE_LINKS } from '../../shared/constants';
import { dualEntry } from '../../shared/dual-entry';
import {
  sidebarFooterLinks,
  sidebarNavGroups,
  type NavItem,
} from '../../shared/nav';

type Props = {
  menuOpen: boolean;
  askActive: boolean;
  onOpenSearch: (trigger?: HTMLElement) => void;
  searchOpen?: boolean;
  onClose: () => void;
  sidebarRef?: RefObject<HTMLElement | null>;
};

function navItemActive(href: string, pathname: string): boolean {
  const path = (href.split('?')[0] || href) as string;

  if (path === dualEntry.browse.path) {
    return (
      pathname === dualEntry.browse.path ||
      pathname.startsWith(`${dualEntry.browse.path}/`)
    );
  }

  return pathname === path || pathname.startsWith(`${path}/`);
}

function itemOrChildActive(item: NavItem, pathname: string): boolean {
  if (navItemActive(item.href, pathname)) return true;
  return Boolean(item.children?.some((c) => navItemActive(c.href, pathname)));
}

function NavLinkRow({
  item,
  pathname,
  nested,
}: {
  item: NavItem;
  pathname: string;
  nested?: boolean;
}) {
  const Ico = item.icon;
  const active = navItemActive(item.href, pathname);
  const branchOpen = itemOrChildActive(item, pathname);

  return (
    <>
      <NavLink
        to={item.href}
        className={() =>
          `nav-link${nested ? ' nav-link-nested' : ''}${
            item.primary ? ' nav-link-primary' : ''
          }${active ? ' nav-link-active' : ''}${
            branchOpen && item.children?.length ? ' nav-link-branch' : ''
          }`
        }
      >
        <Ico
          size={nested ? 14 : 15}
          className="nav-link-icon"
          aria-hidden
          strokeWidth={active || item.primary ? 2.25 : 1.75}
        />
        <span>{item.label}</span>
      </NavLink>
      {item.children && item.children.length > 0 ? (
        <div
          className={`nav-children${branchOpen ? ' is-open' : ''}`}
          role="group"
          aria-label={`${item.label}子项`}
        >
          {item.children.map((child) => (
            <NavLinkRow
              key={child.href}
              item={child}
              pathname={pathname}
              nested
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

export function AppSidebar({
  menuOpen,
  askActive,
  onOpenSearch,
  searchOpen = false,
  onClose,
  sidebarRef,
}: Props) {
  const { pathname } = useLocation();

  return (
    <aside
      id="app-sidebar"
      ref={sidebarRef}
      className={`app-sidebar ${menuOpen ? 'is-open' : ''}`}
      role={menuOpen ? 'dialog' : undefined}
      aria-modal={menuOpen || undefined}
      aria-label="站点导航"
    >
      <div className="app-sidebar-top">
        <div className="app-sidebar-title-row">
          <Link to="/" className="app-sidebar-title" aria-label="首页">
            Walker
          </Link>
          {menuOpen ? (
            <button
              type="button"
              className="app-sidebar-close"
              aria-label="关闭菜单"
              autoFocus
              data-drawer-close
              onClick={onClose}
            >
              <X size={20} aria-hidden />
            </button>
          ) : null}
        </div>

        <Link
          to={dualEntry.ask.path}
          className={`nav-cta-ask${askActive ? ' is-active' : ''}`}
        >
          <MessageCircleQuestion size={15} aria-hidden strokeWidth={2.25} />
          <span>{dualEntry.ask.cta}</span>
        </Link>

        <button
          type="button"
          className="app-search"
          aria-haspopup="dialog"
          aria-expanded={searchOpen}
          onClick={(event) => onOpenSearch(event.currentTarget)}
        >
          <Search size={14} aria-hidden strokeWidth={2} />
          <span>搜索</span>
          <kbd className="app-search-kbd">⌘K</kbd>
        </button>
      </div>

      <nav className="app-sidebar-scroll" aria-label="站内">
        {sidebarNavGroups.map((g, gi) => (
          <div
            key={g.title || `g-${gi}`}
            className={`nav-group${g.title ? '' : ' nav-group-lone'}`}
          >
            {g.title ? (
              <div className="nav-section-title">{g.title}</div>
            ) : null}
            <div className="nav-group-items">
              {g.items.map((item) => (
                <NavLinkRow key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="app-sidebar-foot">
        {sidebarFooterLinks.length > 0 ? (
          <div className="app-sidebar-foot-links">
            {sidebarFooterLinks.map((l) => (
              <Link
                key={l.href}
                to={l.href}
                className={
                  pathname === l.href || pathname.startsWith(`${l.href}/`)
                    ? 'is-active'
                    : undefined
                }
              >
                {l.label}
              </Link>
            ))}
          </div>
        ) : null}
        <div className="app-sidebar-foot-icons">
          <a
            href={SITE_LINKS.github}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
          >
            <Code2 size={15} strokeWidth={1.75} />
          </a>
          <a href={SITE_LINKS.mailto} aria-label="Email">
            <Mail size={15} strokeWidth={1.75} />
          </a>
          <a href={SITE_LINKS.rss} aria-label="RSS" title="RSS">
            <Rss size={14} strokeWidth={1.75} />
          </a>
        </div>
      </div>
    </aside>
  );
}
