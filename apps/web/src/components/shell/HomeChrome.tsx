/**
 * HomeChrome — 首页极简顶条：品牌 + 安静的搜索/关于轻入口，无悬浮 FAB 遮挡小影。
 */
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { utilityAboutItem } from '../../shared/nav';
import { WEB_ROUTES } from '../../shared/routes';

type Props = {
  searchOpen?: boolean;
  onOpenSearch?: (trigger?: HTMLElement) => void;
};

export function HomeChrome({ searchOpen = false, onOpenSearch }: Props) {
  return (
    <header className="home-chrome">
      <Link to={WEB_ROUTES.home} className="home-mobile-brand" aria-label="Walker 首页">
        Walker
      </Link>
      <div className="home-chrome-actions">
        {onOpenSearch ? (
          <button
            type="button"
            className="home-chrome-search"
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
            aria-label="搜索或问小影"
            onClick={(e) => onOpenSearch(e.currentTarget)}
          >
            <Search size={14} aria-hidden />
            <span>搜索或问小影</span>
            <kbd aria-hidden>⌘K</kbd>
          </button>
        ) : null}
        <Link to={utilityAboutItem.href} className="home-chrome-link">
          {utilityAboutItem.label}
        </Link>
      </div>
    </header>
  );
}
