/**
 * 404（页）
 * 职责：未知路径诚实说明，并给出卡/逛入口。
 */
import { Link } from 'react-router-dom';
import { Compass, Home, MessageCircleQuestion } from 'lucide-react';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';

export function NotFoundPage() {
  return (
    <div className="panel-glass" style={{ padding: '2rem 1.5rem', borderRadius: 28 }}>
      <h1 className="page-title">
        <Compass size={24} className="page-title-icon" aria-hidden />
        没有这页
      </h1>
      <p className="page-lead">
        链接可能已改名，或来自旧站路径。主任务仍在「卡」与「逛」。
      </p>
      <div className="home-dual-cta" style={{ justifyContent: 'flex-start' }}>
        <Link to={WEB_ROUTES.home} className="btn-secondary">
          <Home size={16} />
          首页
        </Link>
        <Link to={dualEntry.ask.path} className="btn-primary">
          <MessageCircleQuestion size={16} />
          {dualEntry.ask.cta}
        </Link>
        <Link to={dualEntry.browse.path} className="btn-secondary">
          {dualEntry.browse.cta}
        </Link>
      </div>
    </div>
  );
}
