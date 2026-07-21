/**
 * AppShell — 公开站壳：组合 chrome / 侧栏 / 主区 / 搜索
 * 依赖：shell/*、dual-entry、theme
 * 被调用：App 路由根
 */
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { applySiteTheme } from '../lib/theme';
import { dualEntry } from '../shared/dual-entry';
import { SearchModal } from './SearchModal';
import { AppSidebar } from './shell/AppSidebar';
import { HomeChrome } from './shell/HomeChrome';
import { MobileBar } from './shell/MobileBar';

export function AppShell() {
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const askActive = pathname === dualEntry.ask.path;

  useEffect(() => {
    applySiteTheme();
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openSearch = () => setSearchOpen(true);

  if (isHome) {
    return (
      <>
        <HomeChrome onOpenSearch={openSearch} />
        <Outlet />
        <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
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
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
