/**
 * 公开站 HTTP 门面传输
 * 职责：/api 前缀 + 抛 ApiError；依赖 shared.fetchJson；raw 分支直通 Response（SSE 用）。
 * raw: true 时返回原始 Response（SSE 流式读 body 用），不走 JSON 包装。
 */
import { fetchJson } from '@walker/shared';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

export async function publicRequest<T>(
  path: string,
  init?: RequestInit & { raw?: boolean },
): Promise<T> {
  if (init?.raw) {
    const res = await fetch(`/api${path}`, init);
    if (!res.ok) {
      throw new ApiError(`http-${res.status}`);
    }
    return res as unknown as T;
  }
  const result = await fetchJson<T>(`/api${path}`, init);
  if (!result.ok) {
    throw new ApiError(result.code, result.message);
  }
  return result.data;
}
