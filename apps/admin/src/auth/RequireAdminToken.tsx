/**
 * 路由门：无有效 ADMIN 令牌则去 /login（壳层能力，非展示块）
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ADMIN_ROUTES } from '../shared/routes';
import { getAdminToken } from './token-store';
import { isValidAdminToken } from './token-policy';

export function RequireAdminToken() {
  const location = useLocation();
  if (!isValidAdminToken(getAdminToken())) {
    return (
      <Navigate
        to={ADMIN_ROUTES.login}
        replace
        state={{ from: location.pathname }}
      />
    );
  }
  return <Outlet />;
}
