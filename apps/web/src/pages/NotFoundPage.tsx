/**
 * 404（页）— 诚实说明，给回首页 / 文章 / 问三条路。
 */
import { Link } from 'react-router-dom';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';

export function NotFoundPage() {
  return (
    <div className="measure page-head">
      <h1 className="page-title">这页不在这儿</h1>
      <p className="page-dek">链接可能已改名，或来自旧站路径。</p>
      <p className="inline-actions">
        <Link to={WEB_ROUTES.home}>回首页</Link>
        <Link to={dualEntry.browse.path}>{dualEntry.browse.cta}</Link>
        <Link to={dualEntry.ask.path}>{dualEntry.ask.cta}</Link>
      </p>
    </div>
  );
}
