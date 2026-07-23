/**
 * 门面错误 → 人话（hooks 共用，勿在各 hook 复制）
 */
import { ApiError } from './http';
import { explainErrorCode } from '../shared/rules-ui';

function looksLikeNetworkMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('load failed') ||
    m.includes('network request failed')
  );
}

export function formatApiError(e: unknown): string {
  if (e instanceof ApiError) {
    return explainErrorCode(e.code, e.message);
  }
  if (e instanceof Error) {
    if (looksLikeNetworkMessage(e.message)) {
      return explainErrorCode('network-error');
    }
    return e.message;
  }
  return String(e);
}
