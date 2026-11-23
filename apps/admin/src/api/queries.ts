import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActivityCounts,
  ActivityPage,
  AgentRevisionDetail,
  ContentChangeView,
  ContentDraftBackupResult,
  ContentLedger,
  ContentLedgerEntry,
  ContentRelease,
  ContentSocialStats,
  ContentSyncPullResult,
  ContentSyncStatus,
  ContentVersionSnapshot,
  ConversationLogDetail,
  ExecutionEventView,
  ExecutionRunView,
  OpsAgent,
  OpsCapabilities,
  OpsContentDetail,
  PublicDeploymentReadiness,
  ReleaseCancelResult,
  ReleaseReconcileResult,
  ReleaseResult,
  ReleaseVerificationResult,
  RuntimeLogChannel,
  RuntimeLogPage,
  RuntimeMetrics,
  RuntimeRequestPage,
  SocialShareRecord,
  TextDiffSummary,
} from "@walker/shared";
import { ApiError, requestJson, REQUEST_TIMEOUTS } from "./http";

const enc = encodeURIComponent;

export interface AdminArticleVersionEntry {
  version: number;
  contentHash: string;
  note: string;
  publishedAt: string;
  releaseId: string;
}

export function useCapabilities() {
  return useQuery({
    queryKey: ["ops-capabilities"],
    queryFn: ({ signal }) => requestJson<OpsCapabilities>("/ops/capabilities", { signal, backgroundPoll: true }),
    refetchInterval: 30_000,
  });
}

export function useDeployedAdminVersion() {
  return useQuery({
    queryKey: ["admin-deployed-version"],
    queryFn: async ({ signal }): Promise<string | null> => {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store", signal });
      if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) return null;
      const body = (await res.json()) as { version?: unknown };
      return typeof body?.version === "string" && body.version.trim() ? body.version.trim() : null;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function useContent() {
  return useQuery<{
    data: Array<ContentLedgerEntry & { id: string }>;
    total: number;
    generatedAt: string;
    gitAvailable: boolean;
    publicationAvailable: boolean;
  }>({
    queryKey: ["content"],
    queryFn: async ({ signal }) => {
      const res = await requestJson<ContentLedger>("/admin/content/ledger", { signal });
      if (!Array.isArray(res.items)) throw new ApiError("invalid-response", "内容数据格式不正确");
      return {
        data: res.items.map((item) => ({ ...item, id: item.slug })),
        total: res.items.length,
        generatedAt: res.generatedAt,
        gitAvailable: res.gitAvailable,
        publicationAvailable: res.publicationAvailable,
      };
    },
  });
}

export function useContentDetail(slug: string) {
  return useQuery<{ data: OpsContentDetail & { id: string } }>({
    queryKey: ["content-detail", slug],
    enabled: Boolean(slug),
    queryFn: async ({ signal }) => {
      const data = await requestJson<OpsContentDetail>(`/admin/content/${enc(slug)}`, { signal });
      return { data: { ...data, id: data.slug } };
    },
  });
}

export function fetchContentDetail(slug: string): Promise<OpsContentDetail> {
  return requestJson<OpsContentDetail>(`/admin/content/${enc(slug)}`, { timeoutMs: REQUEST_TIMEOUTS.read });
}

export function useSaveContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, raw, expectedHash }: { slug: string; raw: string; expectedHash: string | null }) =>
      requestJson<OpsContentDetail>(`/admin/content/${enc(slug)}`, {
        method: "PUT",
        body: { raw, expectedHash },
        timeoutMs: REQUEST_TIMEOUTS.write,
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["content"] });
      void qc.invalidateQueries({ queryKey: ["content-detail", vars.slug] });
      void qc.invalidateQueries({ queryKey: ["content-sync-status"] });
    },
  });
}

export function useDeleteContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug }: { slug: string }) =>
      requestJson<{ ok: boolean; slug: string }>(`/admin/content/${enc(slug)}`, {
        method: "DELETE",
        timeoutMs: REQUEST_TIMEOUTS.write,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["content"] });
      void qc.invalidateQueries({ queryKey: ["content-detail"] });
      void qc.invalidateQueries({ queryKey: ["content-sync-status"] });
    },
  });
}

export function useAgents() {
  return useQuery<{ data: OpsAgent[]; total: number }>({
    queryKey: ["agents"],
    queryFn: async ({ signal }) => {
      const res = await requestJson<{ items: OpsAgent[]; total: number }>("/ops/agents", { signal });
      if (!Array.isArray(res.items)) throw new ApiError("invalid-response", "Agent 数据格式不正确");
      return { data: res.items, total: res.total };
    },
  });
}

export function useAgentDetail(id: string) {
  return useQuery<{ data: AgentRevisionDetail }>({
    queryKey: ["agent-detail", id],
    enabled: Boolean(id),
    queryFn: async ({ signal }) => ({
      data: await requestJson<AgentRevisionDetail>(`/ops/agents/${enc(id)}`, { signal }),
    }),
  });
}

export function useExecutionRun(id: string) {
  return useQuery({
    queryKey: ["execution-run", id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => requestJson<ExecutionRunView>(`/ops/execution-runs/${enc(id)}`, { signal }),
  });
}

export function useExecutionEvents(id: string) {
  return useQuery({
    queryKey: ["execution-events", id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => requestJson<{ items: ExecutionEventView[] }>(`/ops/execution-runs/${enc(id)}/events`, { signal }),
  });
}

export function useConversationLogDetail(id: string) {
  return useQuery({
    queryKey: ["conversation-log", id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => requestJson<ConversationLogDetail>(`/ops/conversations/${enc(id)}`, { signal }),
  });
}

export function useConversationActionPreview(conversationId: string) {
  return useQuery({
    queryKey: ["conversation-action-preview", conversationId],
    enabled: conversationId.length > 0,
    queryFn: ({ signal }) =>
      requestJson<{ conversationId: string; contentSlug: string; title: string; summary: string; messageIds: string[]; turnCount: number }>(
        `/ops/conversations/${enc(conversationId)}/action-preview`,
        { signal },
      ),
  });
}

export function useConvertConversationToAction() {
  return useMutation({
    mutationFn: (input: { conversationId: string; title: string; note?: string | null; plannedDate?: string | null; messageIds: string[]; requestKey: string }) =>
      requestJson<{ replayed: boolean; action: { id: string } }>(`/ops/conversations/${enc(input.conversationId)}/action`, {
        method: "POST",
        body: { title: input.title, note: input.note ?? null, plannedDate: input.plannedDate ?? null, messageIds: input.messageIds, requestKey: input.requestKey },
        timeoutMs: REQUEST_TIMEOUTS.write,
      }),
  });
}

export function usePublicDeploymentReadiness(id: string) {
  return useQuery({
    queryKey: ["public-deployment-readiness", id],
    enabled: Boolean(id),
    staleTime: 5_000,
    queryFn: ({ signal }) => requestJson<PublicDeploymentReadiness>(`/ops/deployments/${enc(id)}/readiness`, { signal }),
  });
}

export function useContentChanges(slug?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["content-changes", slug],
    enabled: options?.enabled !== false,
    queryFn: ({ signal }) =>
      requestJson<{ items: ContentChangeView[] }>(slug ? `/ops/content-changes?slug=${enc(slug)}` : "/ops/content-changes", { signal }),
  });
}

export function useApproveContentChange() {
  return useMutation({
    mutationFn: ({ id, grantId }: { id: string; grantId: string }) =>
      requestJson<ContentChangeView>(`/ops/content-changes/${enc(id)}/approve`, { method: "POST", body: { grantId }, timeoutMs: REQUEST_TIMEOUTS.write }),
  });
}

export function useApplyContentChange() {
  return useMutation({
    mutationFn: ({ id, requestId }: { id: string; requestId?: string }) =>
      requestJson<ContentChangeView>(`/ops/content-changes/${enc(id)}/apply`, { method: "POST", body: { requestId }, timeoutMs: REQUEST_TIMEOUTS.write }),
  });
}

export function useContentVersion(slug: string, options?: { enabled?: boolean; refetchInterval?: number | false }) {
  return useQuery({
    queryKey: ["content-version", slug],
    enabled: options?.enabled !== false && Boolean(slug),
    queryFn: ({ signal }) =>
      requestJson<ContentVersionSnapshot>(`/admin/content/release/${enc(slug)}/version`, { signal, backgroundPoll: Boolean(options?.refetchInterval) }),
    refetchInterval: options?.refetchInterval,
  });
}

export function useLatestContentRelease(slug: string, options?: { enabled?: boolean; refetchInterval?: number | false }) {
  return useQuery({
    queryKey: ["content-release-latest", slug],
    enabled: options?.enabled !== false && Boolean(slug),
    queryFn: ({ signal }) =>
      requestJson<ContentRelease | null>(`/admin/content/release/target/${enc(slug)}/latest`, { signal, backgroundPoll: Boolean(options?.refetchInterval) }),
    refetchInterval: options?.refetchInterval,
  });
}

export function usePrepareContentRelease() {
  return useMutation({
    mutationFn: (input: { slug: string; grantId?: string; changeId?: string; requestKey?: string; versionNote: string }) =>
      requestJson<ContentRelease>("/admin/content/release/prepare", { method: "POST", body: input, timeoutMs: REQUEST_TIMEOUTS.write }),
  });
}

export function useTriggerContentRelease() {
  return useMutation({
    mutationFn: (input: { slug: string; releaseId: string }) =>
      requestJson<ReleaseResult>("/admin/content/release", { method: "POST", body: input, timeoutMs: REQUEST_TIMEOUTS.write }),
  });
}

export function useVerifyContentRelease() {
  return useMutation({
    mutationFn: (id: string) => requestJson<ReleaseVerificationResult>(`/admin/content/release/${enc(id)}/verify`, { method: "POST", timeoutMs: 30_000 }),
  });
}

export function useReconcileContentRelease() {
  return useMutation({
    mutationFn: (id: string) => requestJson<ReleaseReconcileResult>(`/admin/content/release/${enc(id)}/reconcile`, { method: "POST", timeoutMs: 30_000 }),
  });
}

export function useCancelContentRelease() {
  return useMutation({
    mutationFn: (id: string) => requestJson<ReleaseCancelResult>(`/admin/content/release/${enc(id)}/cancel`, { method: "POST", timeoutMs: 30_000 }),
  });
}

export function useRuntimeMetrics(options: { refetchInterval?: number | false } = {}) {
  return useQuery({
    queryKey: ["runtime-metrics"],
    queryFn: ({ signal }) => requestJson<RuntimeMetrics>("/ops/runtime/metrics", { signal, backgroundPoll: true }),
    refetchInterval: options.refetchInterval,
  });
}

export function useRuntimeRequests(input: { limit: number; errorsOnly: boolean; humanOnly: boolean; refetchInterval?: number | false }) {
  return useQuery({
    queryKey: ["runtime-requests", input.limit, input.errorsOnly, input.humanOnly],
    queryFn: ({ signal }) => {
      const p = new URLSearchParams({ limit: String(input.limit) });
      if (input.errorsOnly) p.set("errorsOnly", "1");
      if (input.humanOnly) p.set("humanOnly", "1");
      return requestJson<RuntimeRequestPage>(`/ops/runtime/requests?${p}`, { signal, backgroundPoll: true });
    },
    refetchInterval: input.refetchInterval,
  });
}

export function useRuntimeLogs(input: { limit: number; channel?: RuntimeLogChannel; errorsOnly: boolean; refetchInterval?: number | false }) {
  return useQuery({
    queryKey: ["runtime-logs", input.limit, input.channel ?? "all", input.errorsOnly],
    queryFn: ({ signal }) => {
      const p = new URLSearchParams({ limit: String(input.limit) });
      if (input.channel) p.set("ch", input.channel);
      if (input.errorsOnly) p.set("errorsOnly", "1");
      return requestJson<RuntimeLogPage>(`/ops/runtime/logs?${p}`, { signal, backgroundPoll: true });
    },
    refetchInterval: input.refetchInterval,
  });
}

export function useActivityCounts() {
  return useQuery({
    queryKey: ["activity-counts"],
    queryFn: ({ signal }) => requestJson<ActivityCounts>("/ops/activity/counts", { signal, backgroundPoll: true }),
    refetchInterval: 20_000,
  });
}

export function useActivity(input: { kinds: string; before: string | null; enabled?: boolean }) {
  return useQuery({
    queryKey: ["activity", input.kinds, input.before],
    enabled: input.enabled !== false,
    queryFn: ({ signal }) => {
      const p = new URLSearchParams();
      if (input.kinds) p.set("kinds", input.kinds);
      if (input.before) p.set("before", input.before);
      return requestJson<ActivityPage>(`/ops/activity?${p}`, { signal, backgroundPoll: true });
    },
  });
}

export function useContentVersionHistory(slug: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["content-version-history", slug],
    enabled: options?.enabled !== false && Boolean(slug),
    queryFn: ({ signal }) => requestJson<{ slug: string; versions: AdminArticleVersionEntry[] }>(`/admin/content/${enc(slug)}/history`, { signal }),
  });
}

export function fetchContentVersionDetail(slug: string, version: number) {
  return requestJson<{ slug: string; version: AdminArticleVersionEntry; body: string }>(`/admin/content/${enc(slug)}/history/${version}`, { timeoutMs: REQUEST_TIMEOUTS.read });
}

export function fetchContentVersionDiff(slug: string, a: number, b: number) {
  return requestJson<{ slug: string; a: AdminArticleVersionEntry; b: AdminArticleVersionEntry; diff: TextDiffSummary }>(
    `/admin/content/${enc(slug)}/diff/${a}/${b}`,
    { timeoutMs: REQUEST_TIMEOUTS.read },
  );
}

export function useRecordSocialShare(slug: string) {
  return useMutation({
    mutationFn: (body: { channel?: string; angle?: string; note?: string }) =>
      requestJson<{ ok: boolean; record: SocialShareRecord; stats: ContentSocialStats }>(`/admin/content/${enc(slug)}/social-shares`, { method: "POST", body }),
  });
}

export function useContentSyncStatus() {
  return useQuery({
    queryKey: ["content-sync-status"],
    queryFn: ({ signal }) => requestJson<ContentSyncStatus>("/admin/content/sync/status", { signal, backgroundPoll: true }),
    refetchInterval: 30_000,
  });
}

export function useContentSyncPull() {
  return useMutation({ mutationFn: () => requestJson<ContentSyncPullResult>("/admin/content/sync/pull", { method: "POST", timeoutMs: 60_000 }) });
}

export function useContentSyncForceCheck() {
  return useMutation({ mutationFn: () => requestJson<ContentSyncStatus>("/admin/content/sync/status?force=true", { timeoutMs: 30_000 }) });
}

export function useContentDraftBackup() {
  return useMutation({ mutationFn: () => requestJson<ContentDraftBackupResult>("/admin/content/sync/backup-drafts", { method: "POST", timeoutMs: 60_000 }) });
}
