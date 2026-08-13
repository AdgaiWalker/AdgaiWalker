/** 兼容 /kit → 教程（跟学并入） */
import { Navigate } from 'react-router-dom';
import { WEB_ROUTES } from '../shared/routes';

export function KitPage() {
  return <Navigate to={WEB_ROUTES.tutorials} replace />;
}
