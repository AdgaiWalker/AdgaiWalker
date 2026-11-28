/**
 * AppShell — 纸页壳：页眉 + 正文 + 页脚，全站同一根 660px 阅读中轴。
 * 兜底：路由级 ErrorBoundary、版本漂移轻提示；切页回顶（带 #锚点时滚到锚点）。
 */
import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { applySiteTheme } from '../lib/theme';
import { isMobileViewport, trackWebEvent } from '../lib/web-telemetry';
import { ErrorBoundary } from './ErrorBoundary';
import { SiteFooter } from './shell/SiteFooter';
import { SiteHeader } from './shell/SiteHeader';
import { VersionDriftNotice } from './ui/VersionDriftNotice';

export function AppShell() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    applySiteTheme();
  }, []);

  useEffect(() => {
    trackWebEvent('web.page_view', {
      path: pathname,
      viewport: isMobileViewport() ? 'mobile' : 'desktop',
    });
  }, [pathname]);

  useEffect(() => {
    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView?.();
        return;
      }
      const raf = window.requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView?.();
      });
      return () => window.cancelAnimationFrame(raf);
    }
    window.scrollTo?.(0, 0);
  }, [pathname, hash]);

  return (
    <div className="site">
      <a className="skip-link" href="#main">
        跳到正文
      </a>
      <SiteHeader />
      <main id="main" className="site-main">
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <SiteFooter />
      <VersionDriftNotice />
    </div>
  );
}
