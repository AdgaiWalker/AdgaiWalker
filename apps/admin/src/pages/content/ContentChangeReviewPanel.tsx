import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, GitCompare, Save } from "lucide-react";
import type { OpsContentDetail } from "@walker/shared";
import { computeTextDiff, stripFrontmatterBlock } from "@walker/shared";
import {
  useApplyContentChange,
  useApproveContentChange,
  useContentChanges,
} from "../../api/queries";
import { trackAdminUiEvent } from "../../api/telemetry";
import { MarkdownPreview } from "../../components/MarkdownPreview";
import { timeLabel } from "../../shared/labels";

/**
 * AI 候选建议面板（按需在抽屉中挂载）：
 * - 移除 antd Segmented / XMarkdown，改用轻量原生切换与 MarkdownPreview；
 * - 优雅降级：AI 候选接口报错或超时时无声退化为提示，绝不阻断手动编辑与发布。
 */
export function ContentChangeReviewPanel({
  slug,
  currentDoc,
  onApplied,
}: {
  slug: string;
  currentDoc: OpsContentDetail;
  onApplied?: () => void;
}) {
  const { data, isPending, isError, error, refetch } = useContentChanges(slug);
  const approveMutation = useApproveContentChange();
  const applyMutation = useApplyContentChange();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grantIdInput, setGrantIdInput] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"diff" | "preview">("diff");

  useEffect(() => {
    if (isError) {
      trackAdminUiEvent("ai.silent_degraded", {
        feature: "content-changes",
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }, [isError, error]);

  if (isPending) return <p className="muted">读取候选建议中…</p>;

  // 优雅降级：不弹阻断报错，允许站主无感继续手动编辑
  if (isError) {
    return (
      <div className="notice">
        <span>AI 建议暂不可用，可继续直接手动编辑与发布。</span>
        <button type="button" className="btn btn-ghost" onClick={() => void refetch()}>
          重试
        </button>
      </div>
    );
  }

  const items = data?.items ?? [];
  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;

  if (!selected) {
    return <p className="muted">本文暂无待处理的 AI 修改建议。</p>;
  }

  const isConflicted = currentDoc.hash !== selected.baseHash;
  const diff = computeTextDiff(currentDoc.raw, selected.candidateRaw ?? "");

  const handleApprove = async () => {
    if (selected.state !== "PROPOSED" || isConflicted) return;
    const grantId = grantIdInput.trim() || selected.applyApproval?.binding.grantId;
    if (!grantId) {
      setFeedback("请填写有效 L2 授权编号");
      return;
    }
    setFeedback(null);
    try {
      await approveMutation.mutateAsync({ id: selected.id, grantId });
      setFeedback("已批准，可应用到当前草稿");
      await refetch();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "批准失败");
    }
  };

  const handleApply = async () => {
    if (selected.state !== "APPROVED" || isConflicted) return;
    setFeedback(null);
    try {
      await applyMutation.mutateAsync({ id: selected.id });
      setFeedback("已应用到草稿（尚未上线）");
      await refetch();
      onApplied?.();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "应用失败");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.length > 1 ? (
        <select
          aria-label="选择候选提案"
          value={selected.id}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setFeedback(null);
          }}
        >
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id} ({item.state}) · {timeLabel(item.createdAt)}
            </option>
          ))}
        </select>
      ) : null}

      <div className="action-row" style={{ justifyContent: "space-between" }}>
        <span className="badge">{selected.state}</span>
        <div className="mode-switch" role="tablist" aria-label="候选视图">
          <button
            type="button"
            className={viewMode === "diff" ? "is-active" : ""}
            onClick={() => setViewMode("diff")}
          >
            <GitCompare size={12} aria-hidden="true" /> 差异
          </button>
          <button
            type="button"
            className={viewMode === "preview" ? "is-active" : ""}
            onClick={() => setViewMode("preview")}
          >
            <Eye size={12} aria-hidden="true" /> 预览
          </button>
        </div>
      </div>

      {isConflicted ? (
        <div className="notice" role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>文章已被更新，该候选已过期（基线 hash 不一致）。</span>
        </div>
      ) : null}

      {feedback ? <p className="muted">{feedback}</p> : null}

      {selected.state === "PROPOSED" && !isConflicted ? (
        <div className="action-row">
          <input
            type="text"
            placeholder="L2 授权编号 (grantId)"
            value={grantIdInput}
            onChange={(e) => setGrantIdInput(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={approveMutation.isPending}
            onClick={() => void handleApprove()}
          >
            <CheckCircle2 size={14} aria-hidden="true" />
            批准
          </button>
        </div>
      ) : null}

      {selected.state === "APPROVED" && !isConflicted ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={applyMutation.isPending}
          onClick={() => void handleApply()}
        >
          <Save size={14} aria-hidden="true" />
          应用到草稿
        </button>
      ) : null}

      {viewMode === "preview" ? (
        <div className="panel" style={{ maxHeight: 360, overflowY: "auto" }}>
          <MarkdownPreview raw={stripFrontmatterBlock(selected.candidateRaw ?? "")} />
        </div>
      ) : (
        <div className="table-scroll" style={{ maxHeight: 360, border: "1px solid var(--line)", borderRadius: 6 }}>
          <table className="diff-table">
            <tbody>
              {diff.lines.map((line, idx) => (
                <tr
                  key={idx}
                  className={
                    line.type === "added"
                      ? "diff-added"
                      : line.type === "removed"
                        ? "diff-removed"
                        : ""
                  }
                >
                  <td className="diff-line-no">{line.oldLineNumber ?? ""}</td>
                  <td className="diff-line-no">{line.newLineNumber ?? ""}</td>
                  <td>
                    {line.type === "added" ? "+ " : line.type === "removed" ? "- " : "  "}
                    {line.text}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
