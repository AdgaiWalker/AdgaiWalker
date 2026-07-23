/**
 * HomeChrome — 首页顶栏：卡 + 逛 + 搜索（双入口话术一致）
 */
import { Link } from 'react-router-dom';
import { MessageCircleQuestion, PenLine, Search } from 'lucide-react';
import { dualEntry } from '../../shared/dual-entry';

type Props = {
  onOpenSearch: () => void;
};

export function HomeChrome({ onOpenSearch }: Props) {
  return (
    <div className="home-chrome">
      <Link to={dualEntry.ask.path} className="btn-primary">
        <MessageCircleQuestion size={15} />
        {dualEntry.ask.cta}
      </Link>
      <Link to={dualEntry.browse.path} className="btn-secondary">
        <PenLine size={14} />
        {dualEntry.browse.shortCta}
      </Link>
      <button type="button" className="btn-ghost" onClick={onOpenSearch}>
        <Search size={14} />
        搜索
      </button>
    </div>
  );
}
