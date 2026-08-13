/** 兼容 /showcase → 项目（点子请去 /ideas） */
import { Navigate, useSearchParams } from 'react-router-dom';
import { WEB_ROUTES } from '../shared/routes';

export function ShowcasePage() {
  const [params] = useSearchParams();
  if (params.get('tab') === 'ideas') {
    return <Navigate to={WEB_ROUTES.ideas} replace />;
  }
  return <Navigate to={WEB_ROUTES.projects} replace />;
}
