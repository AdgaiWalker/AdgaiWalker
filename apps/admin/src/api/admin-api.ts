import { adminRequest } from './http';

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
  clueSources?: {
    bySource: Record<string, number>;
    byBucket: { visitor: number; self: number; external: number };
    byBucket14d: { visitor: number; self: number; external: number };
    windowDays: number;
  };
}

export const adminApi = {
  clues: () => adminRequest<Clue[]>('/clues'),
  createClue: (body: string, source?: string) =>
    adminRequest<Clue>('/clues', {
      method: 'POST',
      body: JSON.stringify({ body, ...(source ? { source } : {}) }),
    }),
  setPool: (id: string, poolStatus: string) =>
    adminRequest<Clue>(`/clues/${id}/pool`, {
      method: 'PATCH',
      body: JSON.stringify({ poolStatus }),
    }),
  seeds: () => adminRequest<Seed[]>('/seeds'),
  createSeed: (title: string) =>
    adminRequest<Seed>('/seeds', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  promote: (seedId: string, clueId: string) =>
    adminRequest<Seed>(`/seeds/${seedId}/promote`, {
      method: 'POST',
      body: JSON.stringify({ clueId }),
    }),
  link: (seedId: string, clueId: string) =>
    adminRequest<Seed>(`/seeds/${seedId}/link`, {
      method: 'POST',
      body: JSON.stringify({ clueId, asPrimary: false }),
    }),
  executions: () => adminRequest<Execution[]>('/executions'),
  deliver: (id: string, url: string) =>
    adminRequest<Execution>(`/executions/${id}/deliver`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  review: (id: string, outcome: string, evidence?: string) =>
    adminRequest<{ countable?: boolean } & Execution>(
      `/executions/${id}/review`,
      {
        method: 'POST',
        body: JSON.stringify({ outcome, evidence }),
      },
    ),
  metrics: () => adminRequest<Metrics>('/metrics'),
};
