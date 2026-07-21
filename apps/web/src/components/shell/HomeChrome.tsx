/**
 * HomeChrome — 首页顶栏（卡 CTA + 搜索 + 登录）
 */
import { Link } from 'react-router-dom';
import { MessageCircleQuestion, Search } from 'lucide-react';
import { dualEntry } from '../../shared/dual-entry';
import { WEB_ROUTES } from '../../shared/routes';

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
      <Link to={WEB_ROUTES.login} className="btn-ghost" title="账号登录尚未开放">
        账号
      </Link>
    </div>
  );
}
