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
  workflowStatus?: string;
  whyNow?: string | null;
}

export interface Execution {
  id: string;
  seedId: string;
  status: string;
  deliveryUrl: string | null;
  outcome: string | null;
}

export interface Action {
  id: string;
  title: string;
  note: string | null;
  kind: 'TASK' | 'VIDEO';
  status: 'OPEN' | 'DONE';
  plannedDate: string | null;
  completedAt: string | null;
}

export interface Work {
  id: string;
  executionId: string;
  idempotencyKey: string;
  title: string;
  status: string;
  manifestPath: string;
  coreViewpoint: string;
  protectedClaims: string[];
  approvedArtifactHash: string | null;
}

export interface WorkbenchSnapshot {
  topics: Seed[];
  openActions: Action[];
  videoLog: Action[];
  activeWorks: Work[];
  generatedAt: string;
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
  promote: (seedId: string, clueId: string, brief?: Record<string, string>, whyNow?: string) =>
    adminRequest<Seed>(`/seeds/${seedId}/promote`, {
      method: 'POST',
      body: JSON.stringify({ clueId, brief, whyNow }),
    }),
  updateTopic: (seedId: string, body: { title?: string; workflowStatus?: string; whyNow?: string | null }) =>
    adminRequest<Seed>(`/seeds/${seedId}`, { method: 'PATCH', body: JSON.stringify(body) }),
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

  workbench: () => adminRequest<WorkbenchSnapshot>('/workbench'),
  actions: (query?: { status?: string; kind?: string }) => {
    const params = new URLSearchParams();
    if (query?.status) params.set('status', query.status);
    if (query?.kind) params.set('kind', query.kind);
    return adminRequest<Action[]>(`/actions${params.toString() ? `?${params}` : ''}`);
  },
  createAction: (body: { title: string; note?: string; kind?: 'TASK' | 'VIDEO'; plannedDate?: string | null }) =>
    adminRequest<Action>('/actions', { method: 'POST', body: JSON.stringify(body) }),
  updateAction: (id: string, body: { title?: string; note?: string | null; plannedDate?: string | null }) =>
    adminRequest<Action>(`/actions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  completeAction: (id: string) => adminRequest<Action>(`/actions/${id}/complete`, { method: 'POST' }),
  reopenAction: (id: string) => adminRequest<Action>(`/actions/${id}/reopen`, { method: 'POST' }),
  works: () => adminRequest<Work[]>('/works'),
  createWork: (input: { idempotencyKey: string; executionId?: string; title: string; sourceProblem?: string; whyNow?: string; contentBrief?: Record<string, string>; coreViewpoint: string; protectedClaims: string[]; draft: File; attachments?: File[] }) => {
    const form = new FormData();
    form.set('idempotencyKey', input.idempotencyKey);
    if (input.executionId) form.set('executionId', input.executionId);
    form.set('title', input.title);
    if (input.sourceProblem) form.set('sourceProblem', input.sourceProblem);
    if (input.whyNow) form.set('whyNow', input.whyNow);
    if (input.contentBrief) form.set('contentBrief', JSON.stringify(input.contentBrief));
    form.set('coreViewpoint', input.coreViewpoint);
    form.set('protectedClaims', JSON.stringify(input.protectedClaims));
    form.set('draft', input.draft);
    for (const attachment of input.attachments ?? []) form.append('attachments', attachment);
    return adminRequest<Work>('/works', { method: 'POST', body: form });
  },
  produceWork: (id: string, body?: { originalText?: string; fromStage?: string }) =>
    adminRequest<{ status: string; latestHash?: string; failedStage?: string; error?: string }>(`/works/${id}/produce`, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  cancelWork: (id: string) =>
    adminRequest<{ status: 'CANCELLED'; workId: string }>(`/works/${id}/cancel`, { method: 'POST' }),
  acceptManualArtifact: (id: string, artifact: unknown) =>
    adminRequest<{ hash: string }>(`/works/${id}/artifacts`, { method: 'POST', body: JSON.stringify({ artifact }) }),
  approveWork: (id: string, artifactHash: string) =>
    adminRequest<Work>(`/works/${id}/approve`, { method: 'POST', body: JSON.stringify({ artifactHash }) }),
  returnWork: (id: string) => adminRequest<Work>(`/works/${id}/return`, { method: 'POST' }),
  publishWebsite: (id: string, artifactHash: string) =>
    adminRequest<{ status: string; url: string | null }>(`/works/${id}/publish/website`, { method: 'POST', body: JSON.stringify({ artifactHash }) }),
  prepareWechatDraft: (id: string, artifactHash: string) =>
    adminRequest<{ packagePath: string; publication: { status: string } }>(`/works/${id}/publish/wechat-draft`, { method: 'POST', body: JSON.stringify({ artifactHash }) }),
  exportWork: (id: string, destination: string) =>
    adminRequest<{ path: string }>(`/works/${id}/export`, { method: 'POST', body: JSON.stringify({ destination }) }),

  contentList: () => adminRequest<ContentMeta[]>('/admin/content'),
  contentGet: (slug: string) =>
    adminRequest<ContentDetail>(
      `/admin/content/${encodeURIComponent(slug)}`,
    ),
  contentSave: (slug: string, raw: string) =>
    adminRequest<ContentDetail>(
      `/admin/content/${encodeURIComponent(slug)}`,
      { method: 'PUT', body: JSON.stringify({ raw }) },
    ),

  health: () => adminRequest<{ ok: boolean; db: boolean; aiEnabled: boolean }>('/health'),
};

export type ContentMeta = {
  slug: string;
  title: string;
  type: string;
  updatedAt: string;
};

export type ContentDetail = ContentMeta & {
  raw: string;
  ext: '.md' | '.mdx';
};
