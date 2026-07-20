async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
  });
  const data = (await res.json()) as T & { code?: string; message?: string };
  if (!res.ok) {
    throw new Error((data as { code?: string }).code ?? res.statusText);
  }
  return data;
}

export const api = {
  clues: () => req<Clue[]>('/clues'),
  createClue: (body: string) =>
    req<Clue>('/clues', { method: 'POST', body: JSON.stringify({ body }) }),
  setPool: (id: string, poolStatus: string) =>
    req<Clue>(`/clues/${id}/pool`, {
      method: 'PATCH',
      body: JSON.stringify({ poolStatus }),
    }),
  seeds: () => req<Seed[]>('/seeds'),
  createSeed: (title: string) =>
    req<Seed>('/seeds', { method: 'POST', body: JSON.stringify({ title }) }),
  promote: (seedId: string, clueId: string) =>
    req<Seed>(`/seeds/${seedId}/promote`, {
      method: 'POST',
      body: JSON.stringify({ clueId }),
    }),
  link: (seedId: string, clueId: string) =>
    req<Seed>(`/seeds/${seedId}/link`, {
      method: 'POST',
      body: JSON.stringify({ clueId, asPrimary: false }),
    }),
  executions: () => req<Execution[]>('/executions'),
  deliver: (id: string, url: string) =>
    req<Execution>(`/executions/${id}/deliver`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  review: (id: string, outcome: string, evidence?: string) =>
    req<{ countable?: boolean } & Execution>(`/executions/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ outcome, evidence }),
    }),
  metrics: () => req<Metrics>('/metrics'),
};

export interface Clue {
  id: string;
  body: string;
  source: string;
  poolStatus: string;
  createdAt: string;
}

export interface Seed {
  id: string;
  title: string;
  primaryClueId: string | null;
  links: Array<{ clueId: string; role: string; poolStatus: string }>;
}

export interface Execution {
  id: string;
  seedId: string;
  status: string;
  deliveryUrl: string | null;
  outcome: string | null;
}

export interface Metrics {
  clues: number;
  seeds: number;
  executions: number;
  countableLoops: number;
  yesCount: number;
  externalLoopCount: number;
  features: {
    byFeature: Record<string, { attempt: number; success: number; fail: number }>;
    failCodes: Record<string, number>;
  };
}
