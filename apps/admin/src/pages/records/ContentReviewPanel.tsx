import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
  FileQuestion,
  HelpCircle,
  History,
  PenSquare,
  PlusCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { ReviewEntryView, ReviewEvidenceState } from "@walker/shared";
import { useConvertReviewToAction, useCreateReview, useReviews } from "../../api/queries";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { timeLabel } from "../../shared/labels";

const EVIDENCE_LABELS: Record<ReviewEvidenceState, string> = {
  UNKNOWN: "证据未知 / 样本不足",
  INSUFFICIENT: "证据尚不充分",
  SUFFICIENT: "已验证成效",
};

const EVIDENCE_COLORS: Record<ReviewEvidenceState, { bg: string; text: string }> = {
  UNKNOWN: { bg: "#f3f4f6", text: "#4b5563" },
  INSUFFICIENT: { bg: "#fff7ed", text: "#c2410c" },
  SUFFICIENT: { bg: "#f0fdf4", text: "#15803d" },
};

export function ContentReviewPanel() {
  const query = useReviews();
  const createMutation = useCreateReview();

  const [showForm, setShowForm] = useState(false);
  const [actionId, setActionId] = useState("");
  const [releaseId, setReleaseId] = useState("");
  const [didWhat, setDidWhat] = useState("");
  const [observed, setObserved] = useState("");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [evidenceState, setEvidenceState] = useState<ReviewEvidenceState>("UNKNOWN");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [nextAttempt, setNextAttempt] = useState("");

  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const convertMutation = useConvertReviewToAction();
  // 每条复盘的转换各带独立 requestKey（同一按钮重复点击复用同键，服务端幂等回放）
  const [convertKeys, setConvertKeys] = useState<Record<string, string>>({});
  const [convertPlannedDate, setConvertPlannedDate] = useState<Record<string, string>>({});

  const resetForm = () => {
    setActionId("");
    setReleaseId("");
    setDidWhat("");
    setObserved("");
    setWindowStart("");
    setWindowEnd("");
    setEvidenceState("UNKNOWN");
    setEvidenceNote("");
    setNextAttempt("");
    setRequestKey(crypto.randomUUID());
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!actionId.trim()) {
      setFeedback({ kind: "error", text: "必须指定关联事项 ID" });
      return;
    }
    if (!didWhat.trim()) {
      setFeedback({ kind: "error", text: "必须记录做了什么" });
      return;
    }

    try {
      await createMutation.mutateAsync({
        actionId: actionId.trim(),
        releaseId: releaseId.trim() || null,
        didWhat: didWhat.trim(),
        observed: observed.trim() || null,
        windowStart: windowStart.trim() || null,
        windowEnd: windowEnd.trim() || null,
        evidenceState,
        evidenceNote: evidenceNote.trim() || null,
        nextAttempt: nextAttempt.trim() || null,
        requestKey,
      });

      setFeedback({ kind: "ok", text: "复盘记录已保存，结果真实可查，不预设成效。" });
      resetForm();
      setShowForm(false);
      void query.refetch();
    } catch (err) {
      setFeedback({
        kind: "error",
        text: err instanceof Error ? err.message : "保存复盘记录失败",
      });
    }
  };

  const handleConvert = async (item: ReviewEntryView) => {
    setFeedback(null);
    const key = convertKeys[item.id] ?? crypto.randomUUID();
    setConvertKeys((current) => ({ ...current, [item.id]: key }));
    try {
      const result = await convertMutation.mutateAsync({
        reviewId: item.id,
        plannedDate: convertPlannedDate[item.id]?.trim() || null,
        requestKey: key,
      });
      setFeedback({
        kind: "ok",
        text: result.replayed
          ? `这次转换此前已生效（重复点击未创建第二条事项）`
          : `已创建下一事项：${result.action.title}`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "转换失败",
      });
    }
  };

  return (
    <section className="panel" aria-label="更新复盘">
      <header className="panel-heading">
        <h2>
          <PenSquare size={18} style={{ marginRight: 6, verticalAlign: "-3px" }} />
          内容更新复盘
        </h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            className="button"
            onClick={() => void query.refetch()}
            aria-label="刷新复盘"
          >
            <RefreshCw size={16} />
            刷新
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setShowForm((v) => !v);
              setFeedback(null);
            }}
          >
            <PlusCircle size={16} />
            {showForm ? "收起表单" : "登记新复盘"}
          </button>
        </div>
      </header>

      {feedback && (
        <div
          className="notice"
          style={{
            margin: "0 22px 14px",
            background: feedback.kind === "ok" ? "#f0fdf4" : "#fef2f2",
            color: feedback.kind === "ok" ? "#166534" : "#991b1b",
          }}
        >
          {feedback.text}
        </div>
      )}

      {showForm && (
        <form
          className="toolbar"
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            padding: "16px 22px",
            background: "#f9fafb",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div className="notice" style={{ margin: 0 }}>
            <Sparkles size={16} />
            <span>
              复盘只登记事实与客观观察，样本不足如实写「未知」；模型建议不能自动变成已验证成效。
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              关联事项 ID <span style={{ color: "#ef4444" }}>*</span>
              <input
                required
                aria-label="关联事项 ID"
                placeholder="例如：act-123"
                value={actionId}
                onChange={(e) => setActionId(e.target.value)}
              />
            </label>
            <label>
              关联已核验发布版本 ID（选填）
              <input
                aria-label="关联已核验发布版本 ID"
                placeholder="例如：rel-456"
                value={releaseId}
                onChange={(e) => setReleaseId(e.target.value)}
              />
            </label>
          </div>

          <label>
            做了什么变更（客观行为） <span style={{ color: "#ef4444" }}>*</span>
            <input
              required
              aria-label="做了什么变更"
              placeholder="例如：将文章摘要改为 3 句话，补充关于落地工具的对比"
              value={didWhat}
              onChange={(e) => setDidWhat(e.target.value)}
            />
          </label>

          <label>
            观察到的结果或访客反馈（自由文本）
            <textarea
              rows={2}
              aria-label="观察到的结果"
              placeholder="例如：搜索事件中该词提问增多，但访客停留时间样本量较小"
              value={observed}
              onChange={(e) => setObserved(e.target.value)}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <label>
              观察窗口开始
              <input
                type="date"
                aria-label="观察窗口开始"
                value={windowStart}
                onChange={(e) => setWindowStart(e.target.value)}
              />
            </label>
            <label>
              观察窗口结束
              <input
                type="date"
                aria-label="观察窗口结束"
                value={windowEnd}
                onChange={(e) => setWindowEnd(e.target.value)}
              />
            </label>
            <label>
              证据充分度 <span style={{ color: "#ef4444" }}>*</span>
              <select
                aria-label="证据充分度"
                value={evidenceState}
                onChange={(e) => setEvidenceState(e.target.value as ReviewEvidenceState)}
              >
                <option value="UNKNOWN">证据未知 / 样本不足 (默认)</option>
                <option value="INSUFFICIENT">证据尚不充分</option>
                <option value="SUFFICIENT">已充分验证</option>
              </select>
            </label>
          </div>

          <label>
            指标与证据来源说明（如统计窗口、样本量、数据来源）
            <input
              aria-label="证据来源说明"
              placeholder="例如：来源于 /ops/overview 7d 窗口，仅 3 次有效提问，不足以判定成效"
              value={evidenceNote}
              onChange={(e) => setEvidenceNote(e.target.value)}
            />
          </label>

          <label>
            下一次尝试（自由文本建议，待站主后续显式转化）
            <input
              aria-label="下一次尝试"
              placeholder="例如：下周增加案例演示部分，再对比提问转化"
              value={nextAttempt}
              onChange={(e) => setNextAttempt(e.target.value)}
            />
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" className="button" onClick={() => setShowForm(false)}>
              取消
            </button>
            <button type="submit" className="button primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? "正在保存..." : "保存复盘记录"}
            </button>
          </div>
        </form>
      )}

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : query.data?.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 22px" }}>
          {query.data.map((item: ReviewEntryView) => {
            const badge = EVIDENCE_COLORS[item.evidenceState];
            return (
              <article
                key={item.id}
                className="panel"
                style={{
                  margin: 0,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  padding: "16px",
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 8,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 16 }}>{item.didWhat}</h3>
                  <span
                    className="badge"
                    style={{
                      background: badge.bg,
                      color: badge.text,
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {item.evidenceState === "SUFFICIENT" ? (
                      <CheckCircle2 size={13} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                    ) : item.evidenceState === "INSUFFICIENT" ? (
                      <AlertCircle size={13} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                    ) : (
                      <HelpCircle size={13} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                    )}
                    {EVIDENCE_LABELS[item.evidenceState]}
                  </span>
                </div>

                {item.observed && (
                  <p style={{ margin: "4px 0 8px", color: "#374151", fontSize: 14 }}>
                    <strong>观察结果：</strong>
                    {item.observed}
                  </p>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    fontSize: 12,
                    color: "#6b7280",
                    flexWrap: "wrap",
                    marginBottom: 8,
                  }}
                >
                  {(item.windowStart || item.windowEnd) && (
                    <span>
                      <Calendar size={13} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                      观察窗口：{item.windowStart ?? "未设"} 至 {item.windowEnd ?? "未设"}
                    </span>
                  )}
                  <span>事项：{item.actionId}</span>
                  {item.releaseId && <span>发布：{item.releaseId}</span>}
                  <span>创建于：{timeLabel(item.createdAt)}</span>
                </div>

                {item.evidenceNote && (
                  <div
                    style={{
                      background: "#f9fafb",
                      padding: "6px 10px",
                      borderRadius: 4,
                      fontSize: 12,
                      color: "#4b5563",
                      marginBottom: 8,
                    }}
                  >
                    <strong>证据与指标说明：</strong>
                    {item.evidenceNote}
                  </div>
                )}

                {item.nextAttempt && (
                  <div
                    style={{
                      background: "#f0f9ff",
                      borderLeft: "3px solid #0284c7",
                      padding: "6px 10px",
                      borderRadius: 2,
                      fontSize: 13,
                      color: "#0369a1",
                    }}
                  >
                    <strong>下一次尝试：</strong>
                    {item.nextAttempt}
                  </div>
                )}

                {/* O09：显式把复盘建议转为下一事项；站主点击才创建，不自动选题/发布 */}
                {item.nextAttempt && (
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: "1px dashed #e5e7eb",
                      display: "flex",
                      alignItems: "flex-end",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span className="muted">提醒日期（可留空）</span>
                      <input
                        type="date"
                        aria-label={`为复盘 ${item.id} 设置提醒日期`}
                        value={convertPlannedDate[item.id] ?? ""}
                        onChange={(e) =>
                          setConvertPlannedDate((current) => ({
                            ...current,
                            [item.id]: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="button primary"
                      disabled={convertMutation.isPending}
                      onClick={() => void handleConvert(item)}
                    >
                      <ArrowRightLeft size={15} />
                      {convertMutation.isPending ? "正在创建..." : "转为下一事项"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title="暂无内容更新复盘记录">
          完成内容发布与观察后，在此登记做过的改动、观察到的成效与下一次尝试。
        </EmptyState>
      )}
    </section>
  );
}
