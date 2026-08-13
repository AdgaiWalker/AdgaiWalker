/**
 * AppShell — 壳布局
 * 职责：首页画布 / 阅读沉浸 / 常规侧栏；自适应断点由 CSS。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, matchPath } from 'react-router-dom';
import type { BrowseReturnState } from './ItemList';
import { useContentSearch } from '../hooks/useContentSearch';
import { useSearchHotkey } from '../hooks/useSearchHotkey';
import { applySiteTheme } from '../lib/theme';
import { dualEntry } from '../shared/dual-entry';
import { SearchModal } from './ui/SearchModal';
import { AppSidebar } from './shell/AppSidebar';
import { HomeChrome } from './shell/HomeChrome';
import { MobileBar } from './shell/MobileBar';

function isPostDetail(pathname: string): boolean {
  return Boolean(
    matchPath({ path: `${dualEntry.browse.path}/:slug`, end: true }, pathname),
  );
}

function browseHrefFromState(state: unknown): string {
  const s = state as BrowseReturnState | null;
  const q = s?.browseSearch?.trim();
  if (q) return `${dualEntry.browse.path}?${q}`;
  return dualEntry.browse.path;
}

export function AppShell() {
  const location = useLocation();
  const { pathname } = location;
  const isHome = pathname === '/';
  const reading = isPostDetail(pathname);
  const browseHref = browseHrefFromState(location.state);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const searchTriggerRef = useRef<HTMLElement | null>(null);
  const askActive = pathname === dualEntry.ask.path;
  const search = useContentSearch(searchOpen);

  const openSearch = useCallback((trigger?: HTMLElement) => {
    searchTriggerRef.current = trigger ?? (document.activeElement as HTMLElement | null);
    setMenuOpen(false);
    setSearchOpen(true);
  }, []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  useSearchHotkey(openSearch);

  useEffect(() => {
    applySiteTheme();
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen && !searchOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      setSearchOpen(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen, searchOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const focusTimer = window.setTimeout(() => {
      if (
        document.activeElement === document.body ||
        document.activeElement === menuButtonRef.current
      ) {
        sidebar.querySelector<HTMLElement>('[data-drawer-close]')?.focus();
      }
    }, 220);
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        sidebar.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      ).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', trapFocus);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', trapFocus);
      requestAnimationFrame(() => {
        if (document.querySelector('.app-sidebar.is-open')) return;
        if (!document.querySelector('[role="dialog"][aria-labelledby="search-dialog-title"]')) {
          menuButtonRef.current?.focus();
        }
      });
    };
  }, [menuOpen]);

  const searchModal = (
    <SearchModal
      open={searchOpen}
      query={search.query}
      hits={search.hits}
      note={search.note}
      returnFocusTarget={searchTriggerRef.current}
      onClose={closeSearch}
      onQueryChange={search.onQueryChange}
    />
  );

  if (isHome) {
    return (
      <>
        <HomeChrome onOpenSearch={openSearch} searchOpen={searchOpen} />
        <Outlet />
        {searchModal}
      </>
    );
  }

  /** 阅读模式：无侧栏，全宽舞台，正文光学居中 */
  if (reading) {
    return (
      <div className="app-layout is-reading">
        <MobileBar
          reading
          browseHref={browseHref}
          onToggleMenu={() => setMenuOpen((v) => !v)}
          onOpenSearch={openSearch}
          searchOpen={searchOpen}
        />
        <main className="app-main app-main-reading">
          <Outlet />
        </main>
        {searchModal}
      </div>
    );
  }

  return (
    <div className="app-layout">
      <MobileBar
        menuOpen={menuOpen}
        menuButtonRef={menuButtonRef}
        inactive={menuOpen}
        onToggleMenu={() => setMenuOpen((v) => !v)}
        onOpenSearch={openSearch}
        searchOpen={searchOpen}
      />
      <button
        type="button"
        className={`sidebar-backdrop${menuOpen ? ' is-open' : ''}`}
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => setMenuOpen(false)}
      />
      <AppSidebar
        menuOpen={menuOpen}
        askActive={askActive}
        onOpenSearch={openSearch}
        searchOpen={searchOpen}
        onClose={() => setMenuOpen(false)}
        sidebarRef={sidebarRef}
      />
      <main className="app-main app-main-browse" inert={menuOpen}>
        <Outlet />
      </main>
      {searchModal}
    </div>
  );
}
