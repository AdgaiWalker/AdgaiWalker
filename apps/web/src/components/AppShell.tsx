/**
 * AppShell — 壳布局
 * 职责：首页画布 / 阅读沉浸 / 常规侧栏；自适应断点由 CSS。
 */
import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, matchPath } from 'react-router-dom';
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

export function AppShell() {
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const reading = isPostDetail(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const askActive = pathname === dualEntry.ask.path;
  const search = useContentSearch(searchOpen);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  useSearchHotkey(openSearch);

  useEffect(() => {
    applySiteTheme();
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const searchModal = (
    <SearchModal
      open={searchOpen}
      query={search.query}
      hits={search.hits}
      note={search.note}
      onClose={closeSearch}
      onQueryChange={search.onQueryChange}
    />
  );

  if (isHome) {
    return (
      <>
        <HomeChrome onOpenSearch={openSearch} />
        <Outlet />
        {searchModal}
      </>
    );
  }

  /** 阅读模式：无侧栏，主区全宽居中，只专注正文 */
  if (reading) {
    return (
      <div className="app-layout is-reading">
        <MobileBar
          reading
          onToggleMenu={() => setMenuOpen((v) => !v)}
          onOpenSearch={openSearch}
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
        onToggleMenu={() => setMenuOpen((v) => !v)}
        onOpenSearch={openSearch}
      />
      <AppSidebar
        menuOpen={menuOpen}
        askActive={askActive}
        onOpenSearch={openSearch}
      />
      <main className="app-main">
        <Outlet />
      </main>
      {searchModal}
    </div>
  );
}
