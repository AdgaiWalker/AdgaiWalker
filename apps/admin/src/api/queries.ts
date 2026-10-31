import { useList, useOne } from "@refinedev/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  AgentRevisionDetail,
  AllContentSocialStats,
  ContentSocialStats,
  SocialShareRecord,
  ConversationLogDetail,
  ConversationLogPage,
  ConversationExportCreateInput,
  ConversationExportJobView,
  PublicDeploymentReadiness,
  ContentChangeView,
  ContentLedgerEntry,
  ContentRelease,
  ContentVersionSnapshot,
  ExecutionEventView,
  ExecutionRunListItem,
  ExecutionRunView,
  OpsAgent,
  OpsContentDetail,
  ReleaseCancelResult,
  ReleasePreflightResult,
  ReleaseReconcileResult,
  ReleaseResult,
  ReleaseVerificationResult,
  ReminderInbox,
  ActionEvidence,
  OpsOverviewStats,
  OpsStatsWindow,
  ReviewEntryView,
  ActivityCounts,
  ActivityPage,
  RuntimeLogChannel,
  RuntimeLogPage,
  RuntimeMetrics,
  RuntimeRequestPage,
} from "@walker/shared";
import { requestJson, REQUEST_TIMEOUTS } from "./http";

export const useContent = () =>
  useList<ContentLedgerEntry & { id: string }>({
    resource: "content",
    pagination: { mode: "off" },
  }).query;
export const useAgents = () =>
  useList<OpsAgent>({ resource: "agents", pagination: { mode: "off" } }).query;
export function useExecutionRuns(agentId = "", cursor = "", limit = 20) {
  return useQuery({
    queryKey: ["execution-runs", agentId, cursor, limit],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (agentId) params.set("agentId", agentId);
      if (cursor) params.set("cursor", cursor);
      return requestJson<{ items: ExecutionRunListItem[]; next: string | null; total: number }>(
        "/ops/execution-runs?" + params.toString(),
        { signal },
      );
    },
  });
}
export const useContentDetail = (slug: string) =>
  useOne<OpsContentDetail & { id: string }>({ resource: "content", id: slug }).query;

export async function fetchContentDetail(slug: string): Promise<OpsContentDetail> {
  return requestJson<OpsContentDetail>(`/admin/content/${encodeURIComponent(slug)}`, {
    timeoutMs: REQUEST_TIMEOUTS.read,
  });
}

export function useSaveContent() {
  return useMutation({
    mutationFn: ({ slug, raw, expectedHash }: { slug: string; raw: string; expectedHash: string | null }) =>
      requestJson<OpsContentDetail>(`/admin/content/${encodeURIComponent(slug)}`, {
        method: "PUT",
        body: { raw, expectedHash },
        timeoutMs: REQUEST_TIMEOUTS.write,
      }),
  });
}
export function useContentChanges(slug?: string) {
  return useQuery({
    queryKey: ["content-changes", slug],
    queryFn: ({ signal }) => {
      const url = slug
        ? `/ops/content-changes?slug=${encodeURIComponent(slug)}`
        : "/ops/content-changes";
      return requestJson<{ items: ContentChangeView[] }>(url, { signal });
    },
  });
}

export function useContentChange(id: string) {
  return useQuery({
    queryKey: ["content-change", id],
    enabled: Boolean(id),
    queryFn: ({ signal }) =>
      requestJson<ContentChangeView>(`/ops/content-changes/${encodeURIComponent(id)}`, { signal }),
  });
}

export function useApproveContentChange() {
  return useMutation({
    mutationFn: ({ id, grantId }: { id: string; grantId: string }) =>
      requestJson<ContentChangeView>(`/ops/content-changes/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        body: { grantId },
        timeoutMs: REQUEST_TIMEOUTS.write,
      }),
  });
}

export function useApplyContentChange() {
  return useMutation({
    mutationFn: ({ id, requestId }: { id: string; requestId?: string }) =>
      requestJson<ContentChangeView>(`/ops/content-changes/${encodeURIComponent(id)}/apply`, {
        method: "POST",
        body: { requestId },
        timeoutMs: REQUEST_TIMEOUTS.write,
      }),
  });
}

export function useExecutionRun(id: string) {
  return useQuery({
    queryKey: ["execution-run", id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => requestJson<ExecutionRunView>("/ops/execution-runs/" + encodeURIComponent(id), { signal }),
  });
}
export function useExecutionEvents(id: string) {
  return useQuery({
    queryKey: ["execution-events", id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => requestJson<{ items: ExecutionEventView[] }>("/ops/execution-runs/" + encodeURIComponent(id) + "/events", { signal }),
  });
}
export function useConversationLogs(search = "") {
  return useQuery({
    queryKey: ["conversation-logs", search],
    queryFn: ({ signal }) => requestJson<ConversationLogPage>(
      "/ops/conversations" + (search ? `?${search}` : ""),
      { signal },
    ),
  });
}
export function useConversationLogDetail(id: string) {
  return useQuery({
    queryKey: ["conversation-log", id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => requestJson<ConversationLogDetail>(
      "/ops/conversations/" + encodeURIComponent(id), { signal },
    ),
  });
}
export function useCreateConversationExport() {
  return useMutation({
    mutationFn: (input: ConversationExportCreateInput) => requestJson<ConversationExportJobView>(
      "/ops/exports", { method: "POST", body: input, timeoutMs: 30_000 },
    ),
  });
}
export function useConversationExport(id: string) {
  return useQuery({
    queryKey: ["conversation-export", id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => requestJson<ConversationExportJobView>(
      "/ops/exports/" + encodeURIComponent(id), { signal, backgroundPoll: true },
    ),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === "QUEUED" || state === "PROCESSING" ? 1_000 : false;
    },
  });
}
export function usePublicDeploymentReadiness(id: string) {
  return useQuery({
    queryKey: ["public-deployment-readiness", id],
    enabled: Boolean(id),
    staleTime: 5_000,
    queryFn: ({ signal }) => requestJson<PublicDeploymentReadiness>(
      "/ops/deployments/" + encodeURIComponent(id) + "/readiness", { signal },
    ),
  });
}
export const useAgentDetail = (id: string) => useOne<AgentRevisionDetail>({ resource: "agents", id }).query;

export function useContentVersion(slug: string, options?: { enabled?: boolean; refetchInterval?: number | false }) {
  return useQuery({
    queryKey: ["content-version", slug],
    enabled: options?.enabled !== false && Boolean(slug),
    queryFn: ({ signal }) =>
      requestJson<ContentVersionSnapshot>(`/admin/content/release/${encodeURIComponent(slug)}/version`, { signal, backgroundPoll: Boolean(options?.refetchInterval) }),
    refetchInterval: options?.refetchInterval,
  });
}

export function useContentPreflight(slug: string, options?: { enabled?: boolean; refetchInterval?: number | false }) {
  return useQuery({
    queryKey: ["content-preflight", slug],
    enabled: options?.enabled !== false && Boolean(slug),
    queryFn: ({ signal }) =>
      requestJson<ReleasePreflightResult>(`/admin/content/release/preflight`, {
        method: "POST",
        body: { slug },
        signal,
        backgroundPoll: Boolean(options?.refetchInterval),
      }),
    refetchInterval: options?.refetchInterval,
  });
}

export function useLatestContentRelease(slug: string, options?: { enabled?: boolean; refetchInterval?: number | false }) {
  return useQuery({
    queryKey: ["content-release-latest", slug],
    enabled: options?.enabled !== false && Boolean(slug),
    queryFn: ({ signal }) =>
      requestJson<ContentRelease | null>(`/admin/content/release/target/${encodeURIComponent(slug)}/latest`, { signal, backgroundPoll: Boolean(options?.refetchInterval) }),
    refetchInterval: options?.refetchInterval,
  });
}

export function useContentReleaseRecord(id: string, options?: { enabled?: boolean; refetchInterval?: number | false }) {
  return useQuery({
    queryKey: ["content-release-record", id],
    enabled: options?.enabled !== false && Boolean(id),
    queryFn: ({ signal }) =>
      requestJson<ContentRelease>(`/admin/content/release/record/${encodeURIComponent(id)}`, { signal, backgroundPoll: Boolean(options?.refetchInterval) }),
    refetchInterval: options?.refetchInterval,
  });
}

export function usePrepareContentRelease() {
  return useMutation({
    mutationFn: (input: { slug: string; grantId?: string; changeId?: string; requestKey?: string; versionNote: string }) =>
      requestJson<ContentRelease>(`/admin/content/release/prepare`, {
        method: "POST",
        body: input,
        timeoutMs: REQUEST_TIMEOUTS.write,
      }),
  });
}

export function useTriggerContentRelease() {
  return useMutation({
    mutationFn: (input: { slug: string; releaseId: string }) =>
      requestJson<ReleaseResult>(`/admin/content/release`, {
        method: "POST",
        body: input,
        timeoutMs: REQUEST_TIMEOUTS.write,
      }),
  });
}

export function useVerifyContentRelease() {
  return useMutation({
    mutationFn: (id: string) =>
      requestJson<ReleaseVerificationResult>(`/admin/content/release/${encodeURIComponent(id)}/verify`, {
        method: "POST",
        timeoutMs: 30_000,
      }),
  });
}

export function useReconcileContentRelease() {
  return useMutation({
    mutationFn: (id: string) =>
      requestJson<ReleaseReconcileResult>(`/admin/content/release/${encodeURIComponent(id)}/reconcile`, {
        method: "POST",
        timeoutMs: 30_000,
      }),
  });
}

export function useCancelContentRelease() {
  return useMutation({
    mutationFn: (id: string) =>
      requestJson<ReleaseCancelResult>(`/admin/content/release/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        timeoutMs: 30_000,
      }),
  });
}

export function useReminderInbox(options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: ["reminder-inbox"],
    queryFn: ({ signal }) => requestJson<ReminderInbox>("/ops/reminders/inbox", { signal, backgroundPoll: Boolean(options?.refetchInterval) }),
    refetchInterval: options?.refetchInterval,
  });
}

/** 事项提醒处置（O03）：完成 / 延后 / 忽略；requestKey 幂等，重复点击不产生第二次副作用。 */
export function useDisposeReminder() {
  return useMutation({
    mutationFn: (input: {
      actionId: string;
      disposition: "complete" | "snooze" | "ignore";
      plannedDate?: string | null;
      reason?: string | null;
      requestKey: string;
    }) =>
      requestJson<{ disposition: string; replayed: boolean }>(
        `/ops/actions/${encodeURIComponent(input.actionId)}/disposition`,
        {
          method: "POST",
          body: {
            disposition: input.disposition,
            plannedDate: input.plannedDate ?? null,
            reason: input.reason ?? null,
            requestKey: input.requestKey,
          },
          timeoutMs: REQUEST_TIMEOUTS.write,
        },
      ),
  });
}

/** 为内容设置某日提醒（复用既有 Action，不新建任务中心）。 */
export function useCreateContentReminder() {
  return useMutation({
    mutationFn: (input: { slug: string; title: string; plannedDate: string; note?: string }) =>
      requestJson<{ id: string; plannedDate: string | null; dueAt: string | null }>("/actions", {
        method: "POST",
        body: {
          title: input.title,
          note: input.note ?? null,
          plannedDate: input.plannedDate,
          entityType: "CONTENT",
          entityId: input.slug,
        },
        timeoutMs: REQUEST_TIMEOUTS.write,
      }),
  });
}

/** 访客问题转事项预览（O05）：零写入，供界面预填摘要。 */
export function useConversationActionPreview(conversationId: string) {
  return useQuery({
    queryKey: ["conversation-action-preview", conversationId],
    queryFn: ({ signal }) =>
      requestJson<{
        conversationId: string;
        contentSlug: string;
        title: string;
        summary: string;
        messageIds: string[];
        turnCount: number;
      }>(`/ops/conversations/${encodeURIComponent(conversationId)}/action-preview`, { signal }),
    enabled: conversationId.length > 0,
  });
}

/** 显式把访客问题转为更新事项；requestKey 幂等，重复点击不建第二条。 */
export function useConvertConversationToAction() {
  return useMutation({
    mutationFn: (input: {
      conversationId: string;
      title: string;
      note?: string | null;
      plannedDate?: string | null;
      messageIds: string[];
      requestKey: string;
    }) =>
      requestJson<{ replayed: boolean; action: { id: string } }>(
        `/ops/conversations/${encodeURIComponent(input.conversationId)}/action`,
        {
          method: "POST",
          body: {
            title: input.title,
            note: input.note ?? null,
            plannedDate: input.plannedDate ?? null,
            messageIds: input.messageIds,
            requestKey: input.requestKey,
          },
          timeoutMs: REQUEST_TIMEOUTS.write,
        },
      ),
  });
}

/** 从事项回看证据；不可用时返回原因（不假装可见）。 */
export function useActionEvidence(actionId: string) {
  return useQuery({
    queryKey: ["action-evidence", actionId],
    queryFn: ({ signal }) =>
      requestJson<ActionEvidence>(`/ops/actions/${encodeURIComponent(actionId)}/evidence`, { signal }),
    enabled: actionId.length > 0,
  });
}

/** 运营统计（O06/O07）。5 秒轮询；页面隐藏时由调用方传 false 停轮询。 */
export function useOpsOverview(options?: {
  window?: OpsStatsWindow;
  refetchInterval?: number | false;
}) {
  const window = options?.window ?? "7d";
  return useQuery({
    queryKey: ["ops-overview", window],
    queryFn: ({ signal }) =>
      requestJson<OpsOverviewStats>(`/ops/overview?window=${window}`, { signal, backgroundPoll: Boolean(options?.refetchInterval) }),
    refetchInterval: options?.refetchInterval,
  });
}

/** 复盘列表（O08）：回看更新效果、指标来源与下一次尝试。 */
export function useReviews(actionId?: string) {
  return useQuery({
    queryKey: ["reviews", actionId ?? ""],
    queryFn: ({ signal }) => {
      const q = actionId ? `?actionId=${encodeURIComponent(actionId)}` : "";
      return requestJson<ReviewEntryView[]>(`/ops/reviews${q}`, { signal });
    },
  });
}

/** 创建复盘（O08）：关联事项与已核验发布，登记行为、观察、窗口与下一次尝试；requestKey 幂等。 */
export function useCreateReview() {
  return useMutation({
    mutationFn: (input: {
      actionId: string;
      releaseId?: string | null;
      didWhat: string;
      observed?: string | null;
      windowStart?: string | null;
      windowEnd?: string | null;
      nextAttempt?: string | null;
      evidenceState?: "SUFFICIENT" | "INSUFFICIENT" | "UNKNOWN";
      evidenceNote?: string | null;
      requestKey: string;
    }) =>
      requestJson<ReviewEntryView>("/ops/reviews", {
        method: "POST",
        body: input,
        timeoutMs: REQUEST_TIMEOUTS.write,
      }),
  });
}

/** 复盘建议转下一事项（O09）：显式创建，requestKey 幂等。 */
export function useConvertReviewToAction() {
  return useMutation({
    mutationFn: (input: {
      reviewId: string;
      title?: string;
      note?: string | null;
      plannedDate?: string | null;
      requestKey: string;
    }) =>
      requestJson<{ action: { id: string; title: string; plannedDate: string | null; dueAt: string | null }; replayed: boolean }>(
        `/ops/reviews/${encodeURIComponent(input.reviewId)}/action`,
        {
          method: "POST",
          body: {
            title: input.title,
            note: input.note ?? null,
            plannedDate: input.plannedDate ?? null,
            requestKey: input.requestKey,
          },
          timeoutMs: REQUEST_TIMEOUTS.write,
        },
      ),
  });
}

/** 从事项回溯原复盘（O09）：若该事项由复盘生成，返回原复盘记录。 */
export function useReviewForAction(actionId: string) {
  return useQuery({
    queryKey: ["review-for-action", actionId],
    queryFn: ({ signal }) =>
      requestJson<ReviewEntryView | null>(`/ops/actions/${encodeURIComponent(actionId)}/review`, { signal }),
    enabled: actionId.length > 0,
  });
}


/**
 * 本地开发运行监控（只读三件套）。
 *
 * 为什么每个都带 backgroundPoll：轮询是传输层的家常事，不是站主的人工操作。
 * 不带这个标记，每 5 秒一次的 GET 都会在审计记录里留一行，把真正的人工操作淹掉（R 系列约定）。
 */
export function useRuntimeMetrics(options: { refetchInterval?: number | false } = {}) {
  return useQuery({
    queryKey: ["runtime-metrics"],
    queryFn: ({ signal }) =>
      requestJson<RuntimeMetrics>("/ops/runtime/metrics", { signal, backgroundPoll: true }),
    refetchInterval: options.refetchInterval,
  });
}

export function useRuntimeRequests(input: {
  limit: number;
  errorsOnly: boolean;
  /** 只看人工操作：把自动轮询/发布预检滤掉（过滤在服务端做，前端不回退） */
  humanOnly: boolean;
  refetchInterval?: number | false;
}) {
  return useQuery({
    queryKey: ["runtime-requests", input.limit, input.errorsOnly, input.humanOnly],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: String(input.limit) });
      if (input.errorsOnly) params.set("errorsOnly", "1");
      if (input.humanOnly) params.set("humanOnly", "1");
      return requestJson<RuntimeRequestPage>("/ops/runtime/requests?" + params.toString(), {
        signal,
        backgroundPoll: true,
      });
    },
    refetchInterval: input.refetchInterval,
  });
}

export function useRuntimeLogs(input: {
  limit: number;
  channel?: RuntimeLogChannel;
  errorsOnly: boolean;
  refetchInterval?: number | false;
}) {
  return useQuery({
    queryKey: ["runtime-logs", input.limit, input.channel ?? "all", input.errorsOnly],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: String(input.limit) });
      if (input.channel) params.set("ch", input.channel);
      if (input.errorsOnly) params.set("errorsOnly", "1");
      return requestJson<RuntimeLogPage>("/ops/runtime/logs?" + params.toString(), {
        signal,
        backgroundPoll: true,
      });
    },
    refetchInterval: input.refetchInterval,
  });
}


/** 运营活动流（只读聚合；轮询标记的原因见上方运行监控三件套的说明）。 */
export function useActivityCounts() {
  return useQuery({
    queryKey: ["activity-counts"],
    queryFn: ({ signal }) =>
      requestJson<ActivityCounts>("/ops/activity/counts", { signal, backgroundPoll: true }),
    refetchInterval: 15_000,
  });
}

export function useActivity(input: { kinds: string; before: string | null; enabled?: boolean }) {
  return useQuery({
    queryKey: ["activity", input.kinds, input.before],
    enabled: input.enabled !== false,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (input.kinds) params.set("kinds", input.kinds);
      if (input.before) params.set("before", input.before);
      return requestJson<ActivityPage>("/ops/activity?" + params.toString(), {
        signal,
        backgroundPoll: true,
      });
    },
  });
}

// ---- 文章版本历史（只读；版本库为公开区只追加存储） ----

export interface AdminArticleVersionEntry {
  version: number;
  contentHash: string;
  note: string;
  publishedAt: string;
  releaseId: string;
}

export function useContentVersionHistory(slug: string) {
  return useQuery({
    queryKey: ["content-version-history", slug],
    queryFn: ({ signal }) =>
      requestJson<{ slug: string; versions: AdminArticleVersionEntry[] }>(
        `/admin/content/${encodeURIComponent(slug)}/history`,
        { signal },
      ),
  });
}

export async function fetchContentVersionDetail(slug: string, version: number) {
  return requestJson<{ slug: string; version: AdminArticleVersionEntry; body: string }>(
    `/admin/content/${encodeURIComponent(slug)}/history/${version}`,
    { timeoutMs: REQUEST_TIMEOUTS.read },
  );
}

export async function fetchContentVersionDiff(slug: string, a: number, b: number) {
  return requestJson<{
    slug: string;
    a: AdminArticleVersionEntry;
    b: AdminArticleVersionEntry;
    diff: import("@walker/shared").TextDiffSummary;
  }>(`/admin/content/${encodeURIComponent(slug)}/diff/${a}/${b}`, {
    timeoutMs: REQUEST_TIMEOUTS.read,
  });
}

export function useContentSocialStats(slug: string) {
  return useQuery({
    queryKey: ["content-social-stats", slug],
    enabled: Boolean(slug),
    queryFn: ({ signal }) =>
      requestJson<ContentSocialStats>(
        `/admin/content/${encodeURIComponent(slug)}/social-shares`,
        { signal },
      ),
  });
}

export function useAllContentSocialStats() {
  return useQuery({
    queryKey: ["all-content-social-stats"],
    queryFn: ({ signal }) =>
      requestJson<AllContentSocialStats>(
        `/admin/content/social-shares/summary`,
        { signal },
      ),
  });
}

export function useRecordSocialShare(slug: string) {
  return useMutation({
    mutationFn: (body: { channel?: string; angle?: string; note?: string }) =>
      requestJson<{ ok: boolean; record: SocialShareRecord; stats: ContentSocialStats }>(
        `/admin/content/${encodeURIComponent(slug)}/social-shares`,
        {
          method: "POST",
          body,
        },
      ),
  });
}
