/**
 * 公开站 HTTP 门面传输
 * 职责：/api 前缀 + 抛 ApiError；依赖 shared.fetchJson。
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
  init?: RequestInit,
): Promise<T> {
  const result = await fetchJson<T>(`/api${path}`, init);
  if (!result.ok) {
    throw new ApiError(result.code, result.message);
  }
  return result.data;
}
