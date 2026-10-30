import { useEffect, useState } from "react";
import { Link, useBlocker, useParams } from "react-router-dom";
import {
  AlertTriangle,
  Ban,
  CircleAlert,
  Eye,
  FileText,
  GitCompare,
  Layers,
  Pencil,
  RotateCcw,
  Save,
  UploadCloud,
} from "lucide-react";
import type { OpsContentDetail } from "@walker/shared";
import { buildXShareIntentUrl, computeTextDiff, extractSummaryFromRaw } from "@walker/shared";
import {
  fetchContentDetail,
  useContentDetail,
  useContentVersion,
  useSaveContent,
} from "../../api/queries";
import { ApiError } from "../../api/http";
import { ErrorState, LoadingState, PageHeading } from "../../components/States";
import { MarkdownPreview } from "../../components/MarkdownPreview";
import { ContentChangeReviewPanel } from "./ContentChangeReviewPanel";
import { ContentReleasePanel } from "./ContentReleasePanel";
import { ContentReminderPanel } from "./ContentReminderPanel";
import { ContentHistoryPanel } from "./ContentHistoryPanel";
import { ADMIN_ROUTES as R } from "../../shared/routes";
import { timeLabel, typeLabel } from "../../shared/labels";

export function ContentDetailPage() {
  const { slug = "" } = useParams();
  const query = useContentDetail(slug);
  const item = query.data?.data;

  return (
    <>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : (
        item && <ContentDetailEditor item={item} />
      )}
    </>
  );
}

function ContentDetailEditor({ item }: { item: OpsContentDetail }) {
  const saveMutation = useSaveContent();
  const versionQuery = useContentVersion(item.slug);

  const [draft, setDraft] = useState(item.raw);
  const [savedRaw, setSavedRaw] = useState(item.raw);
  const [baseHash, setBaseHash] = useState(item.hash || "");
  const [activeTab, setActiveTab] = useState<
    "edit" | "preview" | "diff" | "raw" | "conflict" | "review" | "release" | "reminder" | "history"
  >("edit");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    remoteRaw: string;
    remoteHash: string;
    remoteUpdatedAt: string;
  } | null>(null);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  const isDirty = draft !== savedRaw;
  const activeGroup = activeTab === "review" || activeTab === "release"
    ? "review"
    : activeTab === "reminder" ? "reminder"
    : activeTab === "history" ? "history" : "edit";
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state === 'blocked') setShowUnsavedModal(true);
  }, [blocker.state]);

  // 刷新/关闭页面未保存保护
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleSave = async () => {
    if (!isDirty || saveMutation.isPending) return;
    setSaveError(null);
    setSaveStatus(null);

    // C22 项目字段校验：项目 status 字段如果提供不能为空
    if (item.type === "project") {
      const match = draft.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (match) {
        const fmText = match[1];
        const statusMatch = fmText.match(/^status:\s*(.*)$/m);
        if (statusMatch && !statusMatch[1].trim()) {
          setSaveError("项目字段校验失败：status 不能为空");
          return;
        }
      }
    }

    try {
      const saved = await saveMutation.mutateAsync({
        slug: item.slug,
        raw: draft,
        expectedHash: baseHash,
      });
      setBaseHash(saved.hash);
      setSavedRaw(saved.raw);
      setConflict(null);
      setSaveStatus("工作区保存成功；网页状态未改变");
    } catch (err: unknown) {
      if (err instanceof ApiError && err.statusCode === 409) {
        try {
          const remote = await fetchContentDetail(item.slug);
          setConflict({
            remoteRaw: remote.raw,
            remoteHash: remote.hash,
            remoteUpdatedAt: remote.updatedAt,
          });
          setActiveTab("conflict");
          setSaveError(
            "检测到版本冲突：远程内容已被修改。您的本地修改未被覆盖，请查看差异并决定如何处理。",
          );
        } catch {
          setSaveError("检测到版本冲突，且无法拉取远程最新版本，请稍后重试");
        }
      } else {
        setSaveError(err instanceof Error ? err.message : "保存失败");
      }
    }
  };

  const handleOverrideRemote = () => {
    if (!conflict) return;
    setBaseHash(conflict.remoteHash);
    setConflict(null);
    setSaveStatus("以我的修改为准更新基线成功，可重新点击「保存到工作区」");
    setSaveError(null);
    setActiveTab("edit");
  };

  const handleAcceptRemote = () => {
    if (!conflict) return;
    setDraft(conflict.remoteRaw);
    setSavedRaw(conflict.remoteRaw);
    setBaseHash(conflict.remoteHash);
    setConflict(null);
    setSaveStatus("已放弃本地修改并同步至远程版本");
    setSaveError(null);
    setActiveTab("edit");
  };

  const handleDiscardLocal = () => {
    setDraft(savedRaw);
    setSaveStatus("已撤回未保存修改");
    setSaveError(null);
  };

  const handleGoToRelease = () => {
    setActiveTab("release");
    setTimeout(() => {
      const target =
        document.getElementById("release-version-note-input") ||
        document.getElementById("release-approval-section");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        if ("focus" in target) {
          (target as HTMLElement).focus();
        }
      }
    }, 100);
  };

  return (
    <>
      <Link className="back-link" to={R.content}>
        返回内容列表
      </Link>

      <PageHeading
        title={item.title}
        description={typeLabel(item.type) + " · 更新于 " + timeLabel(item.updatedAt)}
      />

      <div className="notice" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <span>网页状态：</span>
          <strong>{versionQuery.isPending ? "核对中" : versionQuery.isError ? "状态待核对" : versionQuery.data?.publishedHash ? "线上已确证" : "线上未核验"}</strong>
          <span> · 基线版本 SHA-256：</span>
          <code>{baseHash}</code>
          <br />
          <small className="muted">
            保存操作将写入工作区并受对象锁与 CAS 保护，不会直接发布上线或刷新公共索引。上线走受控发布。
          </small>
        </div>
        {Boolean(versionQuery.data?.publishedHash) && (
          <button
            type="button"
            className="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              background: "#0f1419",
              color: "#ffffff",
              borderColor: "#0f1419",
              fontWeight: 500,
            }}
            onClick={() => {
              const url = buildXShareIntentUrl({
                title: item.title,
                slug: item.slug,
                summary: extractSummaryFromRaw(item.raw),
              });
              window.open(url, "_blank", "noopener,noreferrer");
            }}
            title="在 X (Twitter) 上分享此文章"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            发到 X
          </button>
        )}
      </div>

      {item.type === "project" && (
        <section
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 8,
            padding: "14px 18px",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#166534", fontWeight: 600, marginBottom: 6 }}>
            <Layers size={16} />
            <span>项目受控内容边界</span>
          </div>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: "#14532d", lineHeight: 1.6 }}>
            项目使用现有内容模型受控管理。项目状态、进度与资源清单受管理鉴权、CAS 和对象锁保护；前台访客及前台 AI 无法修改项目状态或进度。
          </p>
        </section>
      )}

      {item.type === "shop" && (
        <section
          style={{
            background: "#fffbeb",
            border: "1px solid #fef3c7",
            borderRadius: 8,
            padding: "14px 18px",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#92400e", fontWeight: 600, marginBottom: 6 }}>
            <AlertTriangle size={16} />
            <span>小店内容与交易边界</span>
          </div>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "#78350f", lineHeight: 1.6 }}>
            小店内容仅用于商品与服务介绍展示。交易、下单、库存与支付功能尚未接入，当前不建立订单或库存数据模型。
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="button"
              disabled
              style={{ opacity: 0.5, cursor: "not-allowed", fontSize: 12, padding: "5px 12px" }}
            >
              <Ban size={13} />
              在线购买（尚未接入）
            </button>
            <button
              type="button"
              className="button"
              disabled
              style={{ opacity: 0.5, cursor: "not-allowed", fontSize: 12, padding: "5px 12px" }}
            >
              <Ban size={13} />
              创建订单（尚未接入）
            </button>
            <small className="muted">未接通功能不显示可执行交易按钮（PRD A20）。</small>
          </div>
        </section>
      )}

      {conflict && (
        <section className="conflict-banner" role="alert">
          <div className="conflict-banner-header">
            <AlertTriangle size={18} />
            <span>检测到版本冲突：远程内容已被修改。您的本地修改未被覆盖！</span>
          </div>
          <p className="conflict-banner-desc">
            远程版本已变更为 <code>{conflict.remoteHash}</code>（更新于{" "}
            {timeLabel(conflict.remoteUpdatedAt)}）。您可以查看冲突差异，并选择以本地修改为准覆盖远程，或放弃本地修改使用远程版本。
          </p>
          <div className="conflict-banner-actions">
            <button
              type="button"
              className="button primary"
              onClick={handleOverrideRemote}
            >
              以我的修改为准（更新基线后可重试保存）
            </button>
            <button
              type="button"
              className="button"
              onClick={handleAcceptRemote}
            >
              放弃本地修改（使用远程版本）
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setActiveTab("conflict")}
            >
              查看冲突比对
            </button>
          </div>
        </section>
      )}

      {saveStatus && (
        <div
          className="notice"
          style={{
            background: "#edfcf2",
            color: "#166534",
            border: "1px solid #bbf7d0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span>{saveStatus}</span>
          {activeGroup !== "review" && (
            <button
              type="button"
              className="button"
              onClick={handleGoToRelease}
              style={{ fontSize: 12, padding: "4px 10px", background: "white", borderColor: "#86efac" }}
            >
              前往发布上线 &rarr;
            </button>
          )}
        </div>
      )}

      {saveError && !conflict && (
        <div className="notice" style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
          {saveError}
        </div>
      )}

      <section className="panel">
        <div className="content-toolbar">
          <div className="content-toolbar-actions">
            <button
              type="button"
              className="button primary"
              disabled={!isDirty || saveMutation.isPending}
              onClick={handleSave}
            >
              <Save size={15} />
              {saveMutation.isPending ? "正在保存..." : "保存到工作区"}
            </button>

            {isDirty && (
              <button
                type="button"
                className="button"
                onClick={handleDiscardLocal}
              >
                <RotateCcw size={15} />
                撤回未保存改动
              </button>
            )}

            {!isDirty && activeGroup !== "review" && (
              <button
                type="button"
                className="button"
                onClick={handleGoToRelease}
                title="前往发布上线面板，填写变更说明并推送到 GitHub"
                style={{ color: "#0e7490", borderColor: "#0e7490" }}
              >
                <UploadCloud size={15} />
                前往发布上线 &rarr;
              </button>
            )}
          </div>

          <div className="content-status-info">
            {isDirty ? (
              <span className="badge red">未保存更改</span>
            ) : (
              <span className="badge green">已保存到工作区（不代表上线）</span>
            )}
          </div>
        </div>

        <nav className="tabs content-workflow-nav" aria-label="内容工作区">
          <button type="button" aria-current={activeGroup === "edit" ? "page" : undefined} onClick={() => setActiveTab("edit")}>编辑</button>
          <button type="button" aria-current={activeGroup === "review" ? "page" : undefined} onClick={() => setActiveTab("review")}>审核与发布</button>
          <button type="button" aria-current={activeGroup === "reminder" ? "page" : undefined} onClick={() => setActiveTab("reminder")}>更新事项</button>
          <button type="button" aria-current={activeGroup === "history" ? "page" : undefined} onClick={() => setActiveTab("history")}>历史</button>
        </nav>

        {activeGroup !== "reminder" && activeGroup !== "history" && <div className="tabs" role="tablist" aria-label="当前工作区操作">
          {activeGroup === "edit" && <>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "edit"}
            aria-pressed={activeTab === "edit"}
            onClick={() => setActiveTab("edit")}
          >
            <Pencil size={14} style={{ marginRight: 6 }} />
            正文
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "preview"}
            aria-pressed={activeTab === "preview"}
            onClick={() => setActiveTab("preview")}
          >
            <Eye size={14} style={{ marginRight: 6 }} />
            预览
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "diff"}
            aria-pressed={activeTab === "diff"}
            onClick={() => setActiveTab("diff")}
          >
            <GitCompare size={14} style={{ marginRight: 6 }} />
            本地差异
          </button>
          {conflict && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "conflict"}
              aria-pressed={activeTab === "conflict"}
              onClick={() => setActiveTab("conflict")}
            >
              <CircleAlert size={14} style={{ marginRight: 6 }} />
              冲突比对
            </button>
          )}
          </>}
          {activeGroup === "review" && <>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "review"}
            aria-pressed={activeTab === "review"}
            onClick={() => setActiveTab("review")}
          >
            <GitCompare size={14} style={{ marginRight: 6 }} />
            候选审阅
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "release"}
            aria-pressed={activeTab === "release"}
            onClick={() => setActiveTab("release")}
          >
            <UploadCloud size={14} style={{ marginRight: 6 }} />
            发布管理
          </button>
          </>}
          {activeGroup === "edit" &&
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "raw"}
            aria-pressed={activeTab === "raw"}
            onClick={() => setActiveTab("raw")}
          >
            <FileText size={14} style={{ marginRight: 6 }} />
            原文与元数据
          </button>
          }
        </div>}

        {activeTab === "edit" && (
          <textarea
            aria-label="正文编辑器"
            className="content-editor-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="请输入文章正文与 frontmatter..."
          />
        )}

        {activeTab === "preview" && <MarkdownPreview raw={draft} />}

        {activeTab === "diff" && (
          <DiffTable oldText={savedRaw} newText={draft} />
        )}

        {activeTab === "conflict" && conflict && (
          <div style={{ padding: 16 }}>
            <h3>远程版本差异对比</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
              当前比对：远程最新版本（旧） vs 您的本地修改草稿（新）
            </p>
            <DiffTable oldText={conflict.remoteRaw} newText={draft} />
          </div>
        )}

        {activeTab === "review" && (
          <ContentChangeReviewPanel slug={item.slug} currentDoc={item} />
        )}

        {activeTab === "release" && (
          <ContentReleasePanel slug={item.slug} currentDoc={item} />
        )}

        {activeTab === "reminder" && (
          <ContentReminderPanel slug={item.slug} title={item.title} />
        )}

        {activeTab === "history" && (
          <ContentHistoryPanel
            slug={item.slug}
            onRestore={(raw, fromVersion) => {
              setDraft(raw);
              setSaveStatus(`已以 v${fromVersion} 正文开草稿——保存并发布后才会成为新版本`);
              setActiveTab("edit");
            }}
          />
        )}

        {activeTab === "raw" && <pre className="raw-content">{draft}</pre>}
      </section>

      {showUnsavedModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="unsaved-modal-title">
          <div className="modal-card">
            <h3 id="unsaved-modal-title">存在未保存的更改</h3>
            <p>当前文章内容已有修改尚未保存到工作区，确定要放弃更改并离开吗？离开后未保存的内容将丢失。</p>
            <div className="modal-card-actions">
              <button
                type="button"
                className="button"
                onClick={() => {
                  setShowUnsavedModal(false);
                  if (blocker.state === 'blocked') blocker.reset();
                }}
              >
                留在本页
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  setShowUnsavedModal(false);
                  if (blocker.state === 'blocked') blocker.proceed();
                }}
              >
                放弃更改并离开
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DiffTable({ oldText, newText }: { oldText: string; newText: string }) {
  const diff = computeTextDiff(oldText, newText);

  if (!diff.hasChanges) {
    return (
      <div className="notice" style={{ margin: "20px" }}>
        内容完全一致，没有文本差异。
      </div>
    );
  }

  return (
    <div className="diff-view">
      <div className="diff-summary">
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
