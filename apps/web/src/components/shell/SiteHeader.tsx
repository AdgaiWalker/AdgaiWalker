/**
 * SiteHeader — 页眉：站名 · 关于 / 作品 / 文章 / 在线 · [问] · 配色切换。
 * 只有真正进入独立页面（如 /me、/posts 或 /posts/:slug）时点亮对应导航项；首页锚点不点亮。
 */
import { Link, useLocation } from 'react-router-dom';
import { dualEntry } from '../../shared/dual-entry';
import { primaryNavItems } from '../../shared/nav';
import { WEB_ROUTES } from '../../shared/routes';
import { ThemeToggle } from './ThemeToggle';

function isActivePrefix(pathname: string, prefix?: string): boolean {
  if (!prefix) return false;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function SiteHeader() {
  const { pathname } = useLocation();
  const askActive = isActivePrefix(pathname, dualEntry.ask.path);

  return (
    <header className="site-header">
      <div className="wrap site-header-row">
        <Link to={WEB_ROUTES.home} className="brand">
          Walker
        </Link>
        <nav className="site-nav" aria-label="站点">
          {primaryNavItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="site-nav-link"
              aria-current={isActivePrefix(pathname, item.matchPrefix) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="site-header-ctl">
          <Link
            to={dualEntry.ask.path}
            className="header-pill"
            aria-current={askActive ? 'page' : undefined}
          >
            {dualEntry.ask.label}
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
