/**
 * 账号入口（页）
 * 职责：诚实声明公开站无登录；不指向已删除的管理令牌页。
 */
import { Link } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';

export function AccountLoginShellPage() {
  return (
    <div>
      <h1 className="page-title">
        <UserRound size={24} className="page-title-icon" aria-hidden />
        账号
      </h1>
      <p className="page-lead">
        访客无需登录即可使用「{dualEntry.ask.label}」与「{dualEntry.browse.label}
        」。公开账号体系未接入，本页不是可用登录表单。
      </p>
      <div
        className="panel-glass"
        style={{ padding: '1.35rem 1.5rem', borderRadius: 28, maxWidth: 480 }}
      >
        <p className="meta" style={{ marginTop: 0 }}>
          状态：<strong>未开放登录</strong>
        </p>
        <p className="meta">
          站主过程在管理端（本机开发默认 <code>:5174</code>
          ），与公开访客账号不是同一套。
        </p>
        <p className="meta" style={{ marginTop: 12 }}>
          <Link to={dualEntry.ask.path} className="btn-primary">
            去{dualEntry.ask.cta}
          </Link>{' '}
          <Link to={WEB_ROUTES.home} className="btn-secondary">
            返回首页
          </Link>
        </p>
      </div>
    </div>
  );
}
