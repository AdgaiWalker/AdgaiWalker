import { useState } from "react";
import { GitPullRequest, RefreshCw, CheckCircle2, AlertCircle, ArrowDownCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatSyncStatusSummary } from "@walker/shared";
import { useContentSyncPull, useContentSyncStatus } from "../api/queries";

export function GitSyncBadge({ compact = false }: { compact?: boolean }) {
  let queryClient: ReturnType<typeof useQueryClient> | null = null;
  try {
    queryClient = useQueryClient();
  } catch {
    // 单元测试中若未包装 QueryClientProvider 则安全兜底
  }
  const syncStatusQuery = useContentSyncStatus();
  const syncPullMutation = useContentSyncPull();
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  const status = syncStatusQuery.data;
  const summary = formatSyncStatusSummary(status);
  const isPulling = syncPullMutation.isPending;

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPulling) return;

    // 如果没有落后远端，点击仅仅是主动刷新一次探测
    if (!status?.behind) {
      await syncStatusQuery.refetch();
      return;
    }

    setFeedback(null);
    try {
      const res = await syncPullMutation.mutateAsync();
      setFeedback({ text: res.message, ok: res.ok });
      // 成功后使内容列表和同步状态失效重查
      if (queryClient) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["content-sync-status"] }),
          queryClient.invalidateQueries({ queryKey: ["content"] }),
          queryClient.invalidateQueries({ queryKey: ["all-content-social-stats"] }),
        ]);
      }
    } catch (err: unknown) {
      setFeedback({
        text: err instanceof Error ? err.message : "同步失败，请检查网络或日志",
        ok: false,
      });
    }
  };

  if (compact) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
        <button
          type="button"
          onClick={handleSync}
          disabled={isPulling}
          title={summary.description}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "12px",
            padding: "4px 8px",
            borderRadius: "6px",
            border: "1px solid",
            cursor: isPulling ? "not-allowed" : "pointer",
            background: summary.state === "behind" ? "#fef3c7" : "#f4f4f5",
            borderColor: summary.state === "behind" ? "#f59e0b" : "#e4e4e7",
            color: summary.state === "behind" ? "#92400e" : "#52525b",
            fontWeight: summary.state === "behind" ? 600 : 500,
          }}
        >
          {isPulling ? (
            <>
              <RefreshCw size={12} className="spin" />
              <span>正在拉取...</span>
            </>
          ) : summary.state === "behind" ? (
            <>
              <ArrowDownCircle size={13} color="#d97706" />
              <span>从 GitHub 同步 ({status?.behind})</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={12} color="#10b981" />
              <span>GitHub 已同步</span>
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: "4px" }}>
      <button
        type="button"
        onClick={handleSync}
        disabled={isPulling}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 12px",
          borderRadius: "8px",
          border: "1px solid",
          cursor: isPulling ? "not-allowed" : "pointer",
          background: summary.state === "behind" ? "#d97706" : "#ffffff",
          borderColor: summary.state === "behind" ? "#b45309" : "#d4d4d8",
          color: summary.state === "behind" ? "#ffffff" : "#18181b",
          fontWeight: 600,
          boxShadow: summary.state === "behind" ? "0 1px 2px rgba(217,119,6,0.2)" : "none",
        }}
      >
        {isPulling ? (
          <>
            <RefreshCw size={14} className="spin" />
            <span>正在同步 GitHub 内容...</span>
          </>
        ) : summary.state === "behind" ? (
          <>
            <ArrowDownCircle size={15} />
            <span>一键从 GitHub 同步 ({status?.behind} 个新提交)</span>
          </>
        ) : (
          <>
            <GitPullRequest size={14} color="#10b981" />
            <span>GitHub 同步 (已是最新)</span>
          </>
        )}
      </button>
      {feedback && (
        <span
          style={{
            fontSize: "12px",
            color: feedback.ok ? "#059669" : "#dc2626",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {feedback.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
          {feedback.text}
        </span>
      )}
    </div>
  );
}
