/** 兼容 /condition → 教程 */
import { Navigate } from 'react-router-dom';
import { WEB_ROUTES } from '../shared/routes';

export function ConditionPage() {
  return <Navigate to={WEB_ROUTES.tutorials} replace />;
}
