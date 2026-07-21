/**
 * 门面错误 → 人话（hooks 共用，勿在各 hook 复制）
 */
import { ApiError } from './http';
import { explainErrorCode } from '../shared/rules-ui';

export function formatApiError(e: unknown): string {
  if (e instanceof ApiError) {
    return explainErrorCode(e.code, e.message);
  }
  return e instanceof Error ? e.message : String(e);
}
