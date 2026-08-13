/**
 * HomeChrome — 首页顶栏：卡 + 逛 + 搜索（双入口话术一致）
 */
import { Link } from 'react-router-dom';
import { MessageCircleQuestion, PenLine, Search } from 'lucide-react';
import { dualEntry } from '../../shared/dual-entry';

type Props = {
  onOpenSearch: (trigger?: HTMLElement) => void;
  searchOpen: boolean;
};

export function HomeChrome({ onOpenSearch, searchOpen }: Props) {
  return (
    <div className="home-chrome">
      <Link to="/" className="home-mobile-brand" aria-label="Walker 首页">
        Walker
      </Link>
      <Link to={dualEntry.ask.path} className="btn-primary">
        <MessageCircleQuestion size={15} />
        {dualEntry.ask.cta}
      </Link>
      <Link to={dualEntry.browse.path} className="btn-secondary">
        <PenLine size={14} />
        {dualEntry.browse.shortCta}
      </Link>
      <button
        type="button"
        className="btn-ghost"
        aria-haspopup="dialog"
        aria-expanded={searchOpen}
        onClick={(event) => onOpenSearch(event.currentTarget)}
      >
        <Search size={14} />
        搜索
      </button>
    </div>
  );
}
