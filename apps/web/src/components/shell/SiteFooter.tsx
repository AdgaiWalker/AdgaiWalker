/**
 * SiteFooter — 页脚：再给一次全站入口，右侧放「问一步」出口。
 */
import { Link } from 'react-router-dom';
import { SITE_LINKS } from '../../shared/constants';
import { dualEntry } from '../../shared/dual-entry';
import { footerNavItems } from '../../shared/nav';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap site-footer-row">
        <nav className="site-footer-nav" aria-label="页脚">
          {footerNavItems.map((item) => (
            <Link key={item.label} to={item.href}>
              {item.label}
            </Link>
          ))}
          <a href={SITE_LINKS.rss}>RSS</a>
        </nav>
        <Link to={dualEntry.ask.path} className="header-pill">
          {dualEntry.ask.cta}
        </Link>
      </div>
    </footer>
  );
}
