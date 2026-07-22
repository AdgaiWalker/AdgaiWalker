/**
 * AppShell — 壳：组合 chrome / 侧栏 / 主区；编排搜索状态（非展示规则）
 */
import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useContentSearch } from '../hooks/useContentSearch';
import { useSearchHotkey } from '../hooks/useSearchHotkey';
import { applySiteTheme } from '../lib/theme';
import { dualEntry } from '../shared/dual-entry';
import { SearchModal } from './ui/SearchModal';
import { AppSidebar } from './shell/AppSidebar';
import { HomeChrome } from './shell/HomeChrome';
import { MobileBar } from './shell/MobileBar';

export function AppShell() {
  const { pathname } = useLocation();
  const isHome = pathname === '/';
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
