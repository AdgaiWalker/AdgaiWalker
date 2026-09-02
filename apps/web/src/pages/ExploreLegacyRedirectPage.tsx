/** 旧点子 / 项目入口 → 探索的对应视图。 */
import { Navigate, useLocation } from 'react-router-dom';
import {
  explorationHref,
  type ExplorationKind,
} from '../shared/exploration';

export function ExploreLegacyRedirectPage({
  view,
}: {
  view: ExplorationKind;
}) {
  const { hash } = useLocation();
  return <Navigate to={`${explorationHref(view)}${hash}`} replace />;
}
