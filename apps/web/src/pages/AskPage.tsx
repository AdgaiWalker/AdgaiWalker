/**
 * 小影页（兼容重定向）：统一收敛至提问页（/tools）
 * 立即重定向并保留 ?q= 参数，确保全站搜索无结果等跳入预填不丢失。
 */
import { Navigate, useLocation } from 'react-router-dom';
import { dualEntry } from '../shared/dual-entry';

export function AskPage() {
  const location = useLocation();
  return (
    <Navigate
      to={{ pathname: dualEntry.ask.path, search: location.search }}
      replace
    />
  );
}
