/**
 * /ideas/new — 旧投稿入口
 * 职责：不双轨投稿；统一到卡口 intake。
 */
import { Navigate } from 'react-router-dom';
import { dualEntry } from '../shared/dual-entry';

export function IdeasNewRedirectPage() {
  return <Navigate to={dualEntry.ask.path} replace />;
}
