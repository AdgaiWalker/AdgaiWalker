import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertOctagon,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  GitCommit,
  Layers,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from "lucide-react";
import type {
  ContentRelease,
  ContentReleaseStage,
  OpsContentDetail,
  ReleaseManifest,
  ReleasePreflightResult,
} from "@walker/shared";
import {
  useCancelContentRelease,
  useContentPreflight,
  useContentVersion,
  useLatestContentRelease,
  usePrepareContentRelease,
  useReconcileContentRelease,
  useTriggerContentRelease,
  useVerifyContentRelease,
} from "../../api/queries";
import { timeLabel } from "../../shared/labels";
import { ADMIN_ROUTES as R } from "../../shared/routes";

const POLL_INTERVAL_MS = 5_000;
const STALE_THRESHOLD_MS = 15_000;

export function ContentReleasePanel({
  slug,
  currentDoc,
}: {
  slug: string;
  currentDoc: OpsContentDetail;
}) {
  // 页面可见性感知：可见时 5 秒轮询，隐藏时停轮询
  const [isVisible, setIsVisible] = useState(() =>
    typeof document !== "undefined" ? document.visibilityState === "visible" : true,
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const pollInterval = isVisible ? POLL_INTERVAL_MS : false;

  const versionQuery = useContentVersion(slug, { refetchInterval: pollInterval });
  const preflightQuery = useContentPreflight(slug, { refetchInterval: pollInterval });
  const latestReleaseQuery = useLatestContentRelease(slug, { refetchInterval: pollInterval });

  const triggerMutation = useTriggerContentRelease();
  const prepareMutation = usePrepareContentRelease();
  const verifyMutation = useVerifyContentRelease();
  const reconcileMutation = useReconcileContentRelease();
  const cancelMutation = useCancelContentRelease();

  const [grantIdInput, setGrantIdInput] = useState("");
  const [versionNoteInput, setVersionNoteInput] = useState("");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<"success" | "error" | "info">("info");

  // 15 秒陈旧检测：记录最近一次拉取成功的时刻
  const [lastFetchedAt, setLastFetchedAt] = useState<number>(Date.now());
  const [isStale, setIsStale] = useState<boolean>(false);

  useEffect(() => {
    if (versionQuery.dataUpdatedAt || preflightQuery.dataUpdatedAt || latestReleaseQuery.dataUpdatedAt) {
      const latest = Math.max(
        versionQuery.dataUpdatedAt || 0,
        preflightQuery.dataUpdatedAt || 0,
        latestReleaseQuery.dataUpdatedAt || 0,
      );
      if (latest > 0) {
        setLastFetchedAt(latest);
        setIsStale(Date.now() - latest > STALE_THRESHOLD_MS);
      }
    }
  }, [versionQuery.dataUpdatedAt, preflightQuery.dataUpdatedAt, latestReleaseQuery.dataUpdatedAt]);

  // 定时检查是否超过 15 秒标陈旧
  useEffect(() => {
    const timer = setInterval(() => {
      setIsStale(Date.now() - lastFetchedAt > STALE_THRESHOLD_MS);
    }, 1_000);
    return () => clearInterval(timer);
  }, [lastFetchedAt]);

  const handleManualRefresh = () => {
    void versionQuery.refetch();
    void preflightQuery.refetch();
    void latestReleaseQuery.refetch();
    setLastFetchedAt(Date.now());
    setIsStale(false);
  };

  const versionSnapshot = versionQuery.data;
  const preflight = preflightQuery.data;
  const latestRelease = latestReleaseQuery.data;
  const currentPublicHash = preflight?.publicHash || null;

  const isReleasing =
    triggerMutation.isPending ||
    prepareMutation.isPending ||
    verifyMutation.isPending ||
    reconcileMutation.isPending ||
    cancelMutation.isPending ||
    latestRelease?.stage === "COMMITTING" ||
    latestRelease?.stage === "PUSHED" ||
    latestRelease?.stage === "VERIFYING";
  const preparedForCurrent = Boolean(
    preflight?.ok && currentPublicHash && latestRelease?.stage === "PREPARED" &&
    latestRelease.target.slug === slug && latestRelease.sourceHash === currentPublicHash,
  );
  const alreadyPublished = Boolean(currentPublicHash && versionSnapshot?.publishedHash === currentPublicHash);
  const versionNote = versionNoteInput.trim();
  const canPrepare = Boolean(preflight?.ok && currentPublicHash && !preparedForCurrent && !alreadyPublished && !isReleasing && versionNote);

  // 独立发布批准与发布准备
  const handlePrepareRelease = async () => {
    const grantId = grantIdInput.trim() || undefined;
    setFeedback(null);
    try {
      const prepared = await prepareMutation.mutateAsync({
        slug,
        grantId,
        versionNote,
      });
      setFeedbackType("success");
      setFeedback(`发布单已生成并完成独立发布批准（单号：${prepared.id}，状态：${prepared.stage}）`);
      await latestReleaseQuery.refetch();
      await versionQuery.refetch();
    } catch (err: unknown) {
      setFeedbackType("error");
      setFeedback(err instanceof Error ? err.message : "发布批准与准备失败");
    }
  };

  // 执行发布上线
  const handleExecuteRelease = async () => {
    if (isReleasing || !preparedForCurrent || !latestRelease) return;
    setFeedback(null);
    try {
      const result = await triggerMutation.mutateAsync({
        slug,
        releaseId: latestRelease.id,
      });
      setActiveRunId(result.runId);
      setFeedbackType("success");
      setFeedback(`上线流程已触发，运行 ID：${result.runId}，当前状态：${result.status}`);
      await latestReleaseQuery.refetch();
      await versionQuery.refetch();
    } catch (err: unknown) {
      setFeedbackType("error");
      setFeedback(err instanceof Error ? err.message : "触发发布失败");
    }
  };

  // 线上版本核验
  const handleVerify = async (releaseId: string) => {
    setFeedback(null);
    try {
      const res = await verifyMutation.mutateAsync(releaseId);
      if (res.verified) {
        setFeedbackType("success");
        setFeedback(`线上核验确证成功！发布版本 SHA-256：${res.verifiedHash}`);
      } else {
        setFeedbackType("error");
        setFeedback(`线上核验未通过：${res.reason || "线上版本与预期不一致"}`);
      }
      await latestReleaseQuery.refetch();
      await versionQuery.refetch();
    } catch (err: unknown) {
      setFeedbackType("error");
      setFeedback(err instanceof Error ? err.message : "核验请求失败");
    }
  };

  // 发布状态核对
  const handleReconcile = async (releaseId: string) => {
    setFeedback(null);
    try {
      const res = await reconcileMutation.mutateAsync(releaseId);
      setFeedbackType(res.resolved ? "success" : "info");
      setFeedback(`核对完成：${res.details}（当前阶段：${res.currentStage}，下一步建议动作：${res.nextAction}）`);
      await latestReleaseQuery.refetch();
      await versionQuery.refetch();
    } catch (err: unknown) {
      setFeedbackType("error");
      setFeedback(err instanceof Error ? err.message : "核对失败");
    }
  };

  // 受控取消发布
  const handleCancel = async (releaseId: string) => {
    setFeedback(null);
    try {
      const res = await cancelMutation.mutateAsync(releaseId);
      setFeedbackType(res.cancelled ? "info" : "error");
      setFeedback(`取消操作结果：${res.message}（阶段：${res.stage}）`);
      await latestReleaseQuery.refetch();
      await versionQuery.refetch();
    } catch (err: unknown) {
      setFeedbackType("error");
      setFeedback(err instanceof Error ? err.message : "取消失败");
    }
  };

  const workingHash = versionSnapshot?.workingHash || currentDoc.hash || "";
  const publishedHash = versionSnapshot?.publishedHash || null;
  const indexedHash = versionSnapshot?.indexedHash || null;

  const isWorkingSynced = publishedHash !== null && currentPublicHash === publishedHash;
  const isIndexSynced = publishedHash !== null && publishedHash === indexedHash;

  return (
    <div style={{ padding: "18px 24px" }}>
      {/* 顶部轮询与陈旧标记栏 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          padding: "8px 12px",
          background: isStale ? "#fffbeb" : "#f8fafc",
          border: isStale ? "1px solid #fef3c7" : "1px solid var(--line)",
          borderRadius: 6,
          fontSize: 13,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={15} color={isStale ? "#b45309" : "#64748b"} />
          <span>
            状态刷新：{isVisible ? "5秒自动轮询中" : "页面已休眠（暂停轮询）"} · 最近同步：
            {timeLabel(new Date(lastFetchedAt).toISOString())}
          </span>
          {isStale && (
            <span
              className="badge"
              style={{
                background: "#fef3c7",
                color: "#92400e",
                border: "1px solid #fde68a",
                fontWeight: 600,
              }}
            >
              数据已陈旧（超过 15 秒未刷新）
            </span>
          )}
        </div>
        <button
          type="button"
          className="button"
          style={{ padding: "4px 10px", fontSize: 12 }}
          onClick={handleManualRefresh}
        >
          <RefreshCw size={13} />
          立即刷新
        </button>
      </div>

      {feedback && (
        <div
          className="notice"
          style={{
            background:
              feedbackType === "success"
                ? "#f0fdf4"
                : feedbackType === "error"
                ? "#fef2f2"
                : "#f8fafc",
            color:
              feedbackType === "success"
                ? "#166534"
                : feedbackType === "error"
                ? "#991b1b"
                : "#1e293b",
            border:
              feedbackType === "success"
                ? "1px solid #bbf7d0"
                : feedbackType === "error"
                ? "1px solid #fecaca"
                : "1px solid var(--line)",
            marginBottom: 16,
          }}
        >
          {feedback}
        </div>
      )}

      {/* 1. 三版本状态对比卡片 */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <Layers size={17} />
          版本状态（正本 · 网页 · 问答索引）
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          {/* 工作区正本 */}
          <div
            style={{
              background: "white",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
              编辑正本版本（工作区文件）
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
              {workingHash ? <code>{workingHash.slice(0, 16)}...</code> : "无数据"}
            </div>
            <div style={{ fontSize: 12 }}>
              <span className="badge">工作区正本</span>
            </div>
          </div>

          {/* 线上网页版本 */}
          <div
            style={{
              background: "white",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
              网页发布版本（线上确证）
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
              {publishedHash ? <code>{publishedHash.slice(0, 16)}...</code> : "尚无线上确证记录"}
            </div>
            <div style={{ fontSize: 12 }}>
              {!publishedHash ? (
                <span className="badge">线上版本未核验</span>
              ) : !currentPublicHash ? (
                <span className="badge">当前公开版本待核对</span>
              ) : isWorkingSynced ? (
                <span className="badge green">与工作区一致</span>
              ) : (
                <span className="badge red">有待发布修改</span>
              )}
            </div>
          </div>

          {/* 问答索引版本 */}
          <div
            style={{
              background: "white",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
              问答快照版本（公开助理索引）
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
              {indexedHash ? <code>{indexedHash.slice(0, 16)}...</code> : "未索引 / 规则兜底"}
            </div>
            <div style={{ fontSize: 12 }}>
              {!publishedHash ? (
                <span className="badge">{indexedHash ? "索引存在·网页未核验" : "索引待核对"}</span>
              ) : isIndexSynced ? (
                <span className="badge green">与线上一致</span>
              ) : !indexedHash ? (
                <span className="badge">索引待核对</span>
              ) : (
                <span className="badge" style={{ background: "#fef3c7", color: "#92400e" }}>
                  索引待同步
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 2. 发布预检与清单范围 */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <FileText size={17} />
          实际发布范围与门禁预检
        </h3>

        {preflightQuery.isPending && (
          <div className="notice">正在预检发布范围与文章门禁...</div>
        )}

        {preflightQuery.isError && (
          <div className="notice" style={{ background: "#fef2f2", color: "#991b1b" }}>
            预检请求异常：{preflightQuery.error instanceof Error ? preflightQuery.error.message : "网络错误"}
          </div>
        )}

        {preflight && !preflight.ok && (
          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: 8,
              padding: "16px",
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#9f1239", fontWeight: 600, marginBottom: 8 }}>
              <AlertOctagon size={18} />
              <span>发布范围冲突或门禁字段不完整，发布受阻</span>
            </div>

            {preflight.scopeConflict && (
              <div style={{ fontSize: 13, color: "#881337", marginBottom: 12 }}>
                <p style={{ margin: "4px 0 8px" }}>{preflight.scopeConflict.message}</p>
                <p style={{ margin: "4px 0 8px" }}>请先处理工作区中的代码改动，再点击“立即刷新”重新预检。</p>
                {preflight.scopeConflict.details.length > 0 && (
                  <details>
                    <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                      查看全部 {preflight.scopeConflict.details.length} 条阻断路径
                    </summary>
                    <ul style={{ margin: "8px 0", paddingLeft: 20, maxHeight: 300, overflowY: "auto" }}>
                      {preflight.scopeConflict.details.map((path) => (
                        <li key={path}><code>{path}</code></li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {preflight.missing && preflight.missing.length > 0 && (
              <div style={{ fontSize: 13, color: "#881337" }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>缺失的公开必需字段：</div>
                <div>{preflight.missing.map((f) => `${f}`).join("、")}</div>
              </div>
            )}
          </div>
        )}

        {preflight?.ok && preflight.manifest && (
          <div
            style={{
              background: "white",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#166534", fontWeight: 600 }}>
                <CheckCircle2 size={16} />
                <span>预检通过：发布范围安全，门禁字段完整</span>
              </div>
              <small className="muted">
                清单生成于：{timeLabel(preflight.manifest.createdAt)}
              </small>
            </div>

            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
              <div>
                目标 SHA-256：<code>{preflight.manifest.targetHash}</code> · 清单 Hash：
                <code>{preflight.manifest.manifestHash.slice(0, 16)}...</code> · Git Head：
                <code>{preflight.manifest.headCommit || "工作区"}</code>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>路径</th>
                    <th>类型</th>
                    <th>状态</th>
                    <th>文件 SHA-256</th>
                  </tr>
                </thead>
                <tbody>
                  {preflight.manifest.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <code>{item.path}</code>
                      </td>
                      <td>{item.kind}</td>
                      <td>
                        <span className="badge">{item.status}</span>
                      </td>
                      <td>
                        <code>{item.hash.slice(0, 16)}...</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* 3. 独立发布批准与执行上线 */}
      <section
        style={{
          background: "#f8fafc",
          border: "1px solid var(--line)",
          borderRadius: 8,
          padding: "18px 20px",
          marginBottom: 24,
        }}
      >
        <h3 style={{ fontSize: 16, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={17} />
          独立发布批准与上线操作
        </h3>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 14px", lineHeight: 1.6 }}>
          保存操作与候选应用仅影响工作区文件。网页发布是独立的副作用，需要独立的发布批准与门禁清单对应。
        </p>

        {latestRelease?.publishApproval && (
          <div
            style={{
              background: "white",
              border: "1px solid var(--line)",
              borderRadius: 6,
              padding: "10px 14px",
              marginBottom: 14,
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600, color: "#166534", marginBottom: 4 }}>
              已绑定独立发布批准
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>
              审批编号：<code>{latestRelease.publishApproval.id}</code> · 审批人：
              {latestRelease.publishApproval.approvedBy} · 授权：
              <code>{latestRelease.publishApproval.binding.grantId}</code>（修订{" "}
              {latestRelease.publishApproval.binding.grantRevision}） · 时间：
              {timeLabel(latestRelease.publishApproval.approvedAt)}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {!preparedForCurrent && !alreadyPublished && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="text"
                placeholder="变更说明（必填，将公开在版本历史）"
                value={versionNoteInput}
                onChange={(e) => setVersionNoteInput(e.target.value)}
                style={{ width: 280 }}
              />
              <input
                type="text"
                placeholder="输入 L2 授权编号（可选）"
                value={grantIdInput}
                onChange={(e) => setGrantIdInput(e.target.value)}
                style={{ width: 220 }}
              />
              <button
                type="button"
                className="button"
                disabled={!canPrepare || prepareMutation.isPending}
                onClick={handlePrepareRelease}
              >
                <ShieldCheck size={15} />
                {prepareMutation.isPending ? "正在批准..." : "独立发布批准"}
              </button>
            </div>
          )}

          <button
            type="button"
            className="button primary"
            disabled={!preparedForCurrent || isReleasing}
            onClick={handleExecuteRelease}
          >
            <UploadCloud size={15} />
            {isReleasing ? "正在发布中..." : "执行发布上线"}
          </button>
        </div>
      </section>

      {/* 4. Release 详情与阶段状态机 */}
      {latestRelease && (
        <section
          style={{
            background: "white",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: "18px 20px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <h3 style={{ fontSize: 16, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <GitCommit size={17} />
              发布单状态：<code>{latestRelease.id}</code>
            </h3>
            <span
              className={
                latestRelease.stage === "PUBLISHED"
                  ? "badge green"
                  : latestRelease.stage === "FAILED"
                  ? "badge red"
                  : latestRelease.stage === "UNKNOWN"
                  ? "badge"
                  : "badge"
              }
              style={{
                background:
                  latestRelease.stage === "UNKNOWN" ? "#fef3c7" : undefined,
                color:
                  latestRelease.stage === "UNKNOWN" ? "#92400e" : undefined,
              }}
            >
              {latestRelease.stage}
            </span>
          </div>

          {/* 阶段状态指示器 */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 16,
              overflowX: "auto",
              paddingBottom: 4,
            }}
          >
            {(
              [
                ["PREPARED", "准备就绪"],
                ["COMMITTING", "提交中"],
                ["PUSHED", "已推送"],
                ["VERIFYING", "核验中"],
                ["PUBLISHED", "已确证发布"],
              ] as const
            ).map(([stageKey, label]) => {
              const isCurrent = latestRelease.stage === stageKey;
              return (
                <div
                  key={stageKey}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: isCurrent ? 600 : 400,
                    background: isCurrent ? "#086b70" : "#f1f5f9",
                    color: isCurrent ? "white" : "#475569",
                  }}
                >
                  {label} ({stageKey})
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.8, marginBottom: 14 }}>
            <div>
              基线 SHA-256：<code>{latestRelease.baseHash.slice(0, 16)}...</code> · 目标 SHA-256：
              <code>{latestRelease.sourceHash.slice(0, 16)}...</code>
            </div>
            {latestRelease.manifestHash && (
              <div>
                发布清单 Hash：<code>{latestRelease.manifestHash}</code>
              </div>
            )}
            {latestRelease.gitCommit && (
              <div>
                Git 提交：<code>{latestRelease.gitCommit}</code>
              </div>
            )}
            <div>
              问答快照同步状态：
              <span className="badge" style={{ marginLeft: 6 }}>
                {latestRelease.assistantIndexState}
              </span>
            </div>
            {latestRelease.verifiedHash && (
              <div style={{ color: "#166534" }}>
                线上确证版本：<code>{latestRelease.verifiedHash}</code>（时间：
                {timeLabel(latestRelease.verifiedAt || "")}）
              </div>
            )}
          </div>

          {/* 失败与异常阶段说明 */}
          {(latestRelease.stage === "FAILED" || latestRelease.stage === "UNKNOWN") && (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 6,
                padding: "12px 14px",
                marginBottom: 14,
                fontSize: 13,
                color: "#991b1b",
              }}
            >
              <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <XCircle size={16} />
                <span>
                  发布处于 {latestRelease.stage} 阶段（错误代码：{latestRelease.errorCode || "无"}）
                </span>
              </div>
              <p style={{ margin: "4px 0 8px", fontSize: 12, lineHeight: 1.6 }}>
                诚实原则：发布失败或结果不明时，系统不会假定或承诺自动回滚已成功。线上内容状态可能保持旧版，也可能已部分生效，请通过“核对”确证真实线上状态。
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="button"
                  style={{ fontSize: 12, padding: "5px 10px" }}
                  disabled={reconcileMutation.isPending}
                  onClick={() => handleReconcile(latestRelease.id)}
                >
                  <RotateCw size={13} />
                  核对真实状态
                </button>
                <button
                  type="button"
                  className="button"
                  style={{ fontSize: 12, padding: "5px 10px" }}
                  disabled={verifyMutation.isPending}
                  onClick={() => handleVerify(latestRelease.id)}
                >
                  <CheckCircle2 size={13} />
                  重试线上核验
                </button>
                {latestRelease.stage !== "FAILED" && (
                  <button
                    type="button"
                    className="button"
                    style={{ fontSize: 12, padding: "5px 10px", color: "#991b1b" }}
                    disabled={cancelMutation.isPending}
                    onClick={() => handleCancel(latestRelease.id)}
                  >
                    <Ban size={13} />
                    受控取消
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 关联运行记录链接 */}
          {activeRunId && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <span>关联运行记录：</span>
              <Link to={R.runDetail(activeRunId)} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <code>{activeRunId}</code>
                <ExternalLink size={13} />
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
