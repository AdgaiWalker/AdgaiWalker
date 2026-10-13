import { useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  GitCompare,
  Save,
} from "lucide-react";
import type { ContentChangeView, OpsContentDetail } from "@walker/shared";
import { computeTextDiff } from "@walker/shared";
import {
  useApplyContentChange,
  useApproveContentChange,
  useContentChanges,
} from "../../api/queries";
import { timeLabel } from "../../shared/labels";

export function ContentChangeReviewPanel({
  slug,
  currentDoc,
}: {
  slug: string;
  currentDoc: OpsContentDetail;
}) {
  const { data, isPending, isError, error, refetch } = useContentChanges(slug);
  const approveMutation = useApproveContentChange();
  const applyMutation = useApplyContentChange();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grantIdInput, setGrantIdInput] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const items = data?.items ?? [];
  const selectedChange = items.find((i) => i.id === selectedId) ?? items[0] ?? null;

  const isConflicted = selectedChange
    ? currentDoc.hash !== selectedChange.baseHash
    : false;

  const handleApprove = async () => {
    if (!selectedChange || selectedChange.state !== "PROPOSED" || isConflicted) return;
    const grantId = grantIdInput.trim() || selectedChange.applyApproval?.binding.grantId;
    if (!grantId) {
      setFeedback("请提供具有审批权限的有效 L2 授权编号");
      return;
    }
    setFeedback(null);
    try {
      await approveMutation.mutateAsync({ id: selectedChange.id, grantId });
      setFeedback("候选已成功批准，可以执行应用到工作区");
      await refetch();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "批准失败");
    }
  };

  const handleApply = async () => {
    if (!selectedChange || selectedChange.state !== "APPROVED" || isConflicted) return;
    setFeedback(null);
    try {
      await applyMutation.mutateAsync({ id: selectedChange.id });
      setFeedback("候选已成功应用到工作区（未发布上线）");
      await refetch();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "应用失败");
    }
  };

  if (isPending) {
    return <div className="notice">正在读取内容候选提案...</div>;
  }

  if (isError) {
    return (
      <div className="error-state">
        <p>读取候选提案失败：{error instanceof Error ? error.message : "网络错误"}</p>
        <button type="button" onClick={() => void refetch()}>重试</button>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="notice" style={{ margin: "20px" }}>
        当前文章尚无候选提案。可通过 Agent 生成或等待后续工作区提议。
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 22px" }}>
      {items.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: "var(--muted)", marginRight: 8 }}>
            选择候选提案：
          </label>
          <select
            value={selectedChange?.id ?? ""}
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
        </div>
      )}

      {selectedChange && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              提案：<code>{selectedChange.id}</code>
            </span>
            <span
              className={
                selectedChange.state === "APPLIED"
                  ? "badge green"
                  : selectedChange.state === "APPROVED"
                  ? "badge"
                  : isConflicted || selectedChange.state === "CONFLICT"
                  ? "badge red"
                  : "badge"
              }
            >
              {selectedChange.state === "PROPOSED"
                ? "待审批"
                : selectedChange.state === "APPROVED"
                ? "已批准"
                : selectedChange.state === "APPLIED"
                ? "已应用到工作区"
                : selectedChange.state === "CONFLICT"
                ? "冲突"
                : selectedChange.state}
            </span>
          </div>

          <div className="source" style={{ padding: 0, marginBottom: 14 }}>
            <div>动作：{selectedChange.action} · 范围：{selectedChange.target.kind}:{selectedChange.target.slug}</div>
            <div>
              基线 SHA-256：<code>{selectedChange.baseHash}</code>
            </div>
            <div>
              候选 SHA-256：<code>{selectedChange.candidateHash}</code>
            </div>
            {selectedChange.sourceRunId && (
              <div>来源 Run ID：<code>{selectedChange.sourceRunId}</code></div>
            )}
          </div>

          {isConflicted && (
            <div
              className="notice"
              style={{
                background: "#fef2f2",
                color: "#991b1b",
                border: "1px solid #fecaca",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                <AlertTriangle size={16} />
                <span>基线版本冲突</span>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.6 }}>
                正本在磁盘上已有新修改（当前正本 hash 为 <code>{currentDoc.hash}</code>，与候选基线 hash 不匹配），原候选已失效，无法批准或应用。
              </p>
            </div>
          )}

          {selectedChange.applyApproval && (
            <div className="notice" style={{ background: "#f8fafc", marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>审批信息：</div>
              <small className="muted">
                审批人：{selectedChange.applyApproval.approvedBy} · 审批时间：{timeLabel(selectedChange.applyApproval.approvedAt)} · 授权：{selectedChange.applyApproval.binding.grantId} (修订 {selectedChange.applyApproval.binding.grantRevision})
              </small>
            </div>
          )}

          {feedback && (
            <div className="notice" style={{ background: "#f0fdf4", color: "#166534", marginBottom: 16 }}>
              {feedback}
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "16px",
              background: "#f8fafb",
              borderRadius: "8px",
              border: "1px solid var(--line)",
              marginBottom: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {selectedChange.state === "PROPOSED" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    aria-label="授权编号"
                    placeholder="输入 L2 授权编号 (grantId)..."
                    value={grantIdInput}
                    onChange={(e) => setGrantIdInput(e.target.value)}
                    style={{ minWidth: 260 }}
                  />
                  <button
                    type="button"
                    className="button primary"
                    disabled={isConflicted || approveMutation.isPending}
                    onClick={() => void handleApprove()}
                  >
                    <CheckCircle2 size={15} />
                    {approveMutation.isPending ? "正在批准..." : "批准保存"}
                  </button>
                </div>
              )}

              {selectedChange.state === "APPROVED" && (
                <button
                  type="button"
                  className="button primary"
                  disabled={isConflicted || applyMutation.isPending}
                  onClick={() => void handleApply()}
                >
                  <Save size={15} />
                  {applyMutation.isPending ? "正在写入..." : "应用到工作区"}
                </button>
              )}

              <button
                type="button"
                className="button"
                disabled
                title="保存不等于发布；上线需通过发布预检与独立发布审批（发布流程在 C12/C13 接通）"
              >
                <ExternalLink size={15} />
                批准发布
              </button>

              <button
                type="button"
                className="button"
                disabled
                title="系统安全红线：禁用持续自主内容授权，每次变更必须逐次人工审批"
              >
                <Ban size={15} />
                持续自主内容授权
              </button>
            </div>

            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
              <div>说明：保存不等于发布；上线需通过发布预检与独立发布审批（C12/C13）。</div>
              <div>安全红线：后台已禁用持续自主内容授权入口，每次变更必须逐次人工审批。</div>
            </div>
          </div>

          <div>
            <h4 style={{ margin: "0 0 10px" }}>原文与候选差异比对：</h4>
            <ReviewDiffTable oldText={currentDoc.raw} newText={selectedChange.candidateRaw || ""} />
          </div>
        </>
      )}
    </div>
  );
}

function ReviewDiffTable({ oldText, newText }: { oldText: string; newText: string }) {
  const diff = computeTextDiff(oldText, newText);

  if (!diff.hasChanges) {
    return (
      <div className="notice">
        当前正本与候选正文完全一致，无文本差异。
      </div>
    );
  }

  return (
    <div className="diff-view" style={{ padding: 0 }}>
      <div className="diff-summary" style={{ marginBottom: 10 }}>
        <span>差异统计：</span>
        <strong style={{ color: "#166534" }}>+{diff.addedCount} 行新增</strong>
        <span>·</span>
        <strong style={{ color: "#991b1b" }}>-{diff.removedCount} 行删除</strong>
        <span>·</span>
        <span>{diff.unchangedCount} 行未变</span>
      </div>
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
                  : "diff-unchanged"
              }
            >
              <td className="diff-line-no">{line.oldLineNumber ?? ""}</td>
              <td className="diff-line-no">{line.newLineNumber ?? ""}</td>
              <td>
                {line.type === "added"
                  ? "+ "
                  : line.type === "removed"
                  ? "- "
                  : "  "}
                {line.text}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
