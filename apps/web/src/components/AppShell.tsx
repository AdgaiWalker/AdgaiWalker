/**
 * AppShell — 极简壳布局
 * 职责：首页画布 / 48px 桌面顶栏 + 手机 4 键底栏 / 阅读专注；全局 Omni-Bar + 路由 ErrorBoundary + 版本更新提示。
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Outlet, useLocation, matchPath } from 'react-router-dom';
import type { BrowseReturnState } from './ItemList';
import { useContentSearch } from '../hooks/useContentSearch';
import { useSearchHotkey } from '../hooks/useSearchHotkey';
import { applySiteTheme } from '../lib/theme';
import { isMobileViewport, trackWebEvent } from '../lib/web-telemetry';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';
import type { SearchHit } from '../shared/search-content';
import { ErrorBoundary } from './ErrorBoundary';
import { SearchModal } from './ui/SearchModal';
import { VersionDriftNotice } from './ui/VersionDriftNotice';
import { HomeChrome } from './shell/HomeChrome';
import { MobileBar } from './shell/MobileBar';
import { TopNav } from './shell/TopNav';

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

export type OmniTrigger = 'hotkey' | 'button' | 'pet' | 'card';

export type AppShellOutletContext = {
  openSearch: (trigger?: HTMLElement, ask?: string, source?: OmniTrigger) => void;
  onQueryChange: (query: string) => void;
  query: string;
  hits: SearchHit[];
  note: string;
  petSearchRef: RefObject<HTMLTextAreaElement | null>;
};

export function AppShell() {
  const location = useLocation();
  const { pathname } = location;
  const isHome = pathname === WEB_ROUTES.home;
  const reading = isPostDetail(pathname);
  const browseHref = browseHrefFromState(location.state);
  const [searchOpen, setSearchOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const searchTriggerRef = useRef<HTMLElement | null>(null);
  const petSearchRef = useRef<HTMLTextAreaElement | null>(null);
  const [seedAsk, setSeedAsk] = useState<string | null>(null);
  const onAskPage = pathname === WEB_ROUTES.assistant;
  const search = useContentSearch(searchOpen, composing);

  const openSearch = useCallback(
    (trigger?: HTMLElement, ask?: string, source: OmniTrigger = 'button') => {
      if (onAskPage) return;
      if (isHome && !ask && source === 'pet' && petSearchRef.current && !searchOpen) {
        petSearchRef.current.focus();
        return;
      }
      searchTriggerRef.current = trigger ?? (document.activeElement as HTMLElement | null);
      setSeedAsk(ask ?? null);
      setSearchOpen(true);
      trackWebEvent('web.omnibar_opened', { trigger: source, path: pathname });
    },
    [onAskPage, isHome, searchOpen, pathname],
  );

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSeedAsk(null);
    setComposing(false);
  }, []);

  useSearchHotkey(() => openSearch(undefined, undefined, 'hotkey'), !onAskPage);

  useEffect(() => {
    applySiteTheme();
  }, []);

  useEffect(() => {
    trackWebEvent('web.page_view', {
      path: pathname,
      viewport: isMobileViewport() ? 'mobile' : 'desktop',
    });
  }, [pathname]);

  const searchModal = onAskPage ? null : (
    <SearchModal
      open={searchOpen}
      query={search.query}
      hits={search.hits}
      note={search.note}
      seedAsk={seedAsk}
      returnFocusTarget={searchTriggerRef.current}
      onClose={closeSearch}
      onQueryChange={search.onQueryChange}
      onSeedAskConsumed={() => setSeedAsk(null)}
      onCompositionChange={setComposing}
    />
  );

  const outletContext: AppShellOutletContext = {
    openSearch,
    onQueryChange: search.onQueryChange,
    query: search.query,
    hits: search.hits,
    note: search.note,
    petSearchRef,
  };

  const routeContent = (
    <ErrorBoundary key={pathname}>
      <Outlet context={outletContext} />
    </ErrorBoundary>
  );

  if (isHome) {
    return (
      <>
        <HomeChrome
          searchOpen={searchOpen}
          onOpenSearch={(el) => openSearch(el, undefined, 'button')}
        />
        <main className="home-stage-main">{routeContent}</main>
        <VersionDriftNotice />
        {searchModal}
      </>
    );
  }

  if (reading) {
    return (
      <div className="app-layout is-reading">
        <MobileBar
          reading
          browseHref={browseHref}
          searchOpen={searchOpen}
          onOpenSearch={(el) => openSearch(el, undefined, 'button')}
        />
        <main className="app-main app-main-reading">{routeContent}</main>
        <VersionDriftNotice />
        {searchModal}
      </div>
    );
  }

  return (
    <div className="app-layout">
      <TopNav
        searchOpen={searchOpen}
        onOpenSearch={(el) => openSearch(el, undefined, 'button')}
      />
      <MobileBar
        searchOpen={searchOpen}
        onOpenSearch={(el) => openSearch(el, undefined, 'button')}
      />
      <main className="app-main app-main-browse">{routeContent}</main>
      <VersionDriftNotice />
      {searchModal}
    </div>
  );
}
