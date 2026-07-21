import { clearAdminToken, getAdminToken } from '../auth/token-store';

export class AdminApiError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AdminApiError';
  }
}

export async function adminRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const body = data as { code?: string; message?: string } | null;
    const code = body?.code ?? res.statusText;
    if (res.status === 401 || code === 'unauthorized' || code === 'auth-not-configured') {
      clearAdminToken();
      if (typeof window !== 'undefined' && !window.location.pathname.endsWith('/login')) {
        window.location.assign('/login');
      }
    }
    throw new AdminApiError(code, body?.message);
  }
  return data as T;
}
