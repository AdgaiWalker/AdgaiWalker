/**
 * HomeChrome — 首页顶栏（卡 CTA + 搜索 + 登录）
 */
import { Link } from 'react-router-dom';
import { MessageCircleQuestion, Search } from 'lucide-react';
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
      <button type="button" className="btn-ghost" onClick={onOpenSearch}>
        <Search size={14} />
        搜索
      </button>
      <Link to="/login" className="btn-ghost">
        登录
      </Link>
    </div>
  );
}
