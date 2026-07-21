/**
 * 公开站账号登录壳 — Auth 未接；避免伪装成已可用登录
 */
import { Link } from 'react-router-dom';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';

export function AccountLoginShellPage() {
  return (
    <div>
      <h1 className="page-title">账号</h1>
      <p className="page-lead">
        访客无需登录即可使用「{dualEntry.ask.label}」（{dualEntry.ask.path}
        ）。账号登录将在 Auth 阶段接入，当前仅保留入口壳。
      </p>
      <div
        className="panel-glass"
        style={{ padding: '1.35rem 1.5rem', borderRadius: 28, maxWidth: 420 }}
      >
        <p className="meta" style={{ marginTop: 0 }}>
          状态：<strong>未开放</strong>
        </p>
        <p className="meta">
          站主过程请使用管理端令牌（本机 admin 的「令牌」页），与公开账号登录不是同一套。
        </p>
        <p className="meta" style={{ marginTop: 12 }}>
          <Link to={dualEntry.ask.path} className="btn-primary">
            去{dualEntry.ask.cta}
          </Link>{' '}
          <Link to={WEB_ROUTES.home} className="btn-ghost">
            返回首页
          </Link>
        </p>
      </div>
    </div>
  );
}
