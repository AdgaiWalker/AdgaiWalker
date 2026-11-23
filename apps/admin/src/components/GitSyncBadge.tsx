import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownCircle,
  CheckCircle2,
  CloudUpload,
  GitPullRequest,
  RefreshCw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatSyncStatusSummary } from "@walker/shared";
import {
  useContentDraftBackup,
  useContentSyncForceCheck,
  useContentSyncPull,
  useContentSyncStatus,
} from "../api/queries";

const TONE = {
  synced: { bg: "#f4f4f5", border: "#e4e4e7", color: "#52525b", icon: "#10b981" },
  behind: { bg: "#fef3c7", border: "#f59e0b", color: "#92400e", icon: "#d97706" },
  ahead: { bg: "#eff6ff", border: "#93c5fd", color: "#1d4ed8", icon: "#2563eb" },
  dirty: { bg: "#f8fafc", border: "#cbd5e1", color: "#334155", icon: "#64748b" },
  diverged: { bg: "#fff7ed", border: "#fb923c", color: "#9a3412", icon: "#ea580c" },
  conflict: { bg: "#fef2f2", border: "#f87171", color: "#991b1b", icon: "#dc2626" },
  error: { bg: "#fef2f2", border: "#f87171", color: "#991b1b", icon: "#dc2626" },
  unknown: { bg: "#f4f4f5", border: "#d4d4d8", color: "#71717a", icon: "#71717a" },
} as const;

export function GitSyncBadge({ compact = false }: { compact?: boolean }) {
  let queryClient: ReturnType<typeof useQueryClient> | null = null;
  try { queryClient = useQueryClient(); } catch { /* unit tests without QueryClientProvider */ }

  const statusQuery = useContentSyncStatus();
  const pullMutation = useContentSyncPull();
  const forceMutation = useContentSyncForceCheck();
  const backupMutation = useContentDraftBackup();
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  const status = statusQuery.data;
  const summary = formatSyncStatusSummary(status);
  const tone = TONE[summary.state];
  const isBusy = pullMutation.isPending || forceMutation.isPending;
  const hasDrafts = (status?.dirtyFiles?.length ?? 0) > 0;

  const invalidateAll = async () => {
    if (!queryClient) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["content-sync-status"] }),
      queryClient.invalidateQueries({ queryKey: ["content"] }),
      queryClient.invalidateQueries({ queryKey: ["all-content-social-stats"] }),
    ]);
  };

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBusy) return;
    setFeedback(null);
    try {
      if (summary.state !== "behind") {
        const fresh = await forceMutation.mutateAsync();
        if (queryClient) queryClient.setQueryData(["content-sync-status"], fresh);
        else await statusQuery.refetch();
        if (fresh?.fetchError) setFeedback({ text: `探测失败：${fresh.fetchError}`, ok: false });
        return;
      }
      const res = await pullMutation.mutateAsync();
      setFeedback({ text: res.message, ok: res.ok });
      await invalidateAll();
    } catch (err: unknown) {
      setFeedback({ text: err instanceof Error ? err.message : "同步失败，请检查网络或日志", ok: false });
    }
  };

  const handleBackupDrafts = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (backupMutation.isPending) return;
    setFeedback(null);
    try {
      const res = await backupMutation.mutateAsync();
      setFeedback({ text: res.message, ok: res.ok });
      await invalidateAll();
    } catch (err: unknown) {
      setFeedback({ text: err instanceof Error ? err.message : "草稿备份失败", ok: false });
    }
  };

  const iconSize = compact ? 12 : 14;
  const icon = isBusy ? <RefreshCw size={iconSize} className="spin" />
    : summary.state === "synced" ? <CheckCircle2 size={iconSize} color={tone.icon} />
    : summary.state === "behind" ? <ArrowDownCircle size={iconSize} color={compact ? tone.icon : "currentColor"} />
    : summary.state === "error" || summary.state === "conflict" ? <AlertCircle size={iconSize} color={tone.icon} />
    : summary.state === "diverged" || summary.state === "unknown" ? <AlertTriangle size={iconSize} color={tone.icon} />
    : <GitPullRequest size={iconSize} color={tone.icon} />;

  const label = pullMutation.isPending ? (compact ? "正在拉取..." : "正在同步 GitHub 内容...")
    : forceMutation.isPending ? (compact ? "正在探测..." : "正在探测 GitHub...")
    : summary.state === "behind" ? (compact ? `从 GitHub 同步 (${status?.behind})` : `一键从 GitHub 同步 (${status?.behind} 个新提交)`)
    : summary.state === "synced" ? (compact ? "GitHub 已同步" : "GitHub 同步 (已是最新)")
    : summary.label;

  const isBehindFull = !compact && summary.state === "behind";
  const isSyncedFull = !compact && summary.state === "synced";
  const btnStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: compact ? "5px" : "6px",
    fontSize: compact ? "12px" : undefined, padding: compact ? "4px 8px" : "6px 12px",
    borderRadius: compact ? "6px" : "8px", border: "1px solid",
    cursor: isBusy ? "not-allowed" : "pointer",
    fontWeight: compact && summary.state === "synced" ? 500 : 600,
    background: isBehindFull ? "#d97706" : isSyncedFull ? "#ffffff" : tone.bg,
    borderColor: isBehindFull ? "#b45309" : isSyncedFull ? "#d4d4d8" : tone.border,
    color: isBehindFull ? "#ffffff" : isSyncedFull ? "#18181b" : tone.color,
  };

  if (compact) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
        <button type="button" onClick={handleSync} disabled={isBusy} title={summary.description} style={btnStyle}>
          {icon}<span>{label}</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <button type="button" onClick={handleSync} disabled={isBusy} title={summary.description} style={btnStyle}>
          {icon}<span>{label}</span>
        </button>
        {hasDrafts && (
          <button
            type="button"
            onClick={handleBackupDrafts}
            disabled={backupMutation.isPending}
            title="将未发布草稿备份到 GitHub 独立 drafts 分支（不触发网站发布）"
            style={{
              display: "inline-flex", alignItems: "center", gap: "5px", padding: "6px 10px",
              borderRadius: "8px", border: "1px solid #cbd5e1", background: "#ffffff",
              color: "#334155", fontSize: "13px", fontWeight: 500,
              cursor: backupMutation.isPending ? "not-allowed" : "pointer",
            }}
          >
            <CloudUpload size={14} />
            <span>{backupMutation.isPending ? "正在备份草稿..." : `备份草稿 (${status?.dirtyFiles.length})`}</span>
          </button>
        )}
      </div>
      {feedback && (
        <span style={{ fontSize: "12px", color: feedback.ok ? "#059669" : "#dc2626", display: "inline-flex", alignItems: "center", gap: "4px" }}>
          {feedback.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
          {feedback.text}
        </span>
      )}
    </div>
  );
}
