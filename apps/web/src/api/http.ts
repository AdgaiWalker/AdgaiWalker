/**
 * 公开站 HTTP 传输层：只负责 fetch / 解析 / 抛错码，不含 UI。
 */

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
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const body = data as { code?: string; message?: string } | null;
    throw new ApiError(
      body?.code ?? res.statusText,
      body?.message,
    );
  }
  return data as T;
}
