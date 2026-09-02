/** 兼容 /showcase → 探索；旧 tab=ideas 保留点子视图。 */
import { Navigate, useSearchParams } from 'react-router-dom';
import { explorationHref } from '../shared/exploration';

export function ShowcasePage() {
  const [params] = useSearchParams();
  if (params.get('tab') === 'ideas') {
    return <Navigate to={explorationHref('idea')} replace />;
  }
  return <Navigate to={explorationHref()} replace />;
}
