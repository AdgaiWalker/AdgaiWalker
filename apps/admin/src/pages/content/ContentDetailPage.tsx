import { useEffect, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  History,
  MoreHorizontal,
  RefreshCw,
  Save,
  Share2,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { OpsContentDetail } from "@walker/shared";
import { buildSocialCopyText, buildXShareIntentUrl, extractSummaryFromRaw, getPublicPostUrl } from "@walker/shared";
import { ApiError } from "../../api/http";
import {
  fetchContentDetail,
  useCancelContentRelease,
  useContentChanges,
  useContentDetail,
  useContentVersion,
  useDeleteContent,
  useLatestContentRelease,
  usePrepareContentRelease,
  useReconcileContentRelease,
  useRecordSocialShare,
  useSaveContent,
  useTriggerContentRelease,
  useVerifyContentRelease,
} from "../../api/queries";
import { trackAdminUiEvent } from "../../api/telemetry";
import { MarkdownPreview } from "../../components/MarkdownPreview";
import { ModalDialog } from "../../components/ModalDialog";
import { SlideDrawer } from "../../components/SlideDrawer";
import { ErrorState, LoadingState } from "../../components/States";
import { ADMIN_ROUTES as R } from "../../shared/routes";
import { ContentChangeReviewPanel } from "./ContentChangeReviewPanel";
import { ContentHistoryPanel } from "./ContentHistoryPanel";

type DrawerSection = "history" | "ai" | "share" | "delete";

export function ContentDetailPage() {
  const { slug = "" } = useParams();
  const query = useContentDetail(slug);
  const item = query.data?.data;

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} retry={query.refetch} />;
  if (!item) return null;
  return <ContentCanvas key={item.slug} item={item} />;
}

function ContentCanvas({ item }: { item: OpsContentDetail }) {
  const navigate = useNavigate();
  const saveMutation = useSaveContent();
  const deleteMutation = useDeleteContent();
  const prepareMutation = usePrepareContentRelease();
  const triggerMutation = useTriggerContentRelease();
  const verifyMutation = useVerifyContentRelease();
  const reconcileMutation = useReconcileContentRelease();
  const cancelMutation = useCancelContentRelease();
  const recordShareMutation = useRecordSocialShare(item.slug);

  const [draft, setDraft] = useState(item.raw);
  const [savedRaw, setSavedRaw] = useState(item.raw);
  const [baseHash, setBaseHash] = useState(item.hash || "");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 按需显现状态
  const [publishOpen, setPublishOpen] = useState(false);
  const [versionNote, setVersionNote] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSection, setDrawerSection] = useState<DrawerSection>("history");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [conflict, setConflict] = useState<{ remoteRaw: string; remoteHash: string } | null>(null);

  // 仅发布在途态按 5s 轮询（空闲态彻底 0 轮询）
  const [inFlight, setInFlight] = useState(false);
  const pollInterval = inFlight ? 5_000 : false;
  const latestRelease = useLatestContentRelease(item.slug, { refetchInterval: pollInterval });
  const versionQuery = useContentVersion(item.slug, { refetchInterval: pollInterval });
  const changesQuery = useContentChanges(item.slug, { enabled: drawerOpen && drawerSection === "ai" });

  const release = latestRelease.data;
  const stage = release?.stage;

  useEffect(() => {
    setInFlight(stage === "COMMITTING" || stage === "PUSHED" || stage === "VERIFYING");
  }, [stage]);

  const isDirty = draft !== savedRaw;
  const isLive =
    Boolean(versionQuery.data?.publishedHash && versionQuery.data.publishedHash === versionQuery.data.workingHash) &&
    !isDirty &&
    !inFlight;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const performSave = async (overrideHash?: string): Promise<boolean> => {
    setErrorMessage(null);
    setStatusMessage(null);
    if (item.type === "project") {
      const fm = draft.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
      const st = fm.match(/^status:\s*(.*)$/m);
      if (st && !st[1].trim()) {
        setErrorMessage("项目字段校验失败：status 不能为空");
        return false;
      }
    }
    const t0 = Date.now();
    try {
      const updated = await saveMutation.mutateAsync({
        slug: item.slug,
        raw: draft,
        expectedHash: overrideHash ?? (baseHash || null),
      });
      setSavedRaw(updated.raw);
      setDraft(updated.raw);
      setBaseHash(updated.hash || "");
      setConflict(null);
      setStatusMessage("已保存");
      trackAdminUiEvent("editor.save_completed", { durationMs: Date.now() - t0, conflict: false });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 409) {
        trackAdminUiEvent("editor.save_completed", { durationMs: Date.now() - t0, conflict: true });
        try {
          const latest = await fetchContentDetail(item.slug);
          setConflict({ remoteRaw: latest.raw, remoteHash: latest.hash || "" });
        } catch {
          setErrorMessage("文件已被外部更新，请刷新后再试");
        }
        return false;
      }
      setErrorMessage(err instanceof Error ? err.message : "保存失败");
      return false;
    }
  };

  // 键盘快捷键：⌘S 保存，⌘⇧P 打开发布
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (isDirty && !saveMutation.isPending) void performSave();
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPublishOpen(true);
        trackAdminUiEvent("publish.flow_started", { slug: item.slug, dirty: isDirty });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // 核心自动化：1 次点击串行完成 save(如脏) → prepare(versionNote) → release → 后端自动 verify
  const handleOneClickPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    const note = versionNote.trim();
    if (!note) {
      setErrorMessage("请填写一句公开变更说明");
      return;
    }
    setPublishing(true);
    setErrorMessage(null);
    const t0 = Date.now();
    try {
      if (isDirty) {
        const ok = await performSave();
        if (!ok) {
          setPublishOpen(false);
          trackAdminUiEvent("publish.flow_abandoned", { slug: item.slug, reason: "error" });
          return;
        }
      }
      const prepared = await prepareMutation.mutateAsync({
        slug: item.slug,
        versionNote: note,
        requestKey: `pub-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      });
      await triggerMutation.mutateAsync({ slug: item.slug, releaseId: prepared.id });
      setPublishOpen(false);
      setVersionNote("");
      setInFlight(true);
      setStatusMessage("已推送到 GitHub，正在自动等待线上确证…");
      trackAdminUiEvent("publish.flow_completed", { slug: item.slug, durationMs: Date.now() - t0 });
      void latestRelease.refetch();
      void versionQuery.refetch();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "发布失败");
      trackAdminUiEvent("publish.flow_abandoned", { slug: item.slug, reason: "error" });
    } finally {
      setPublishing(false);
    }
  };

  const openDrawer = (section: DrawerSection) => {
    setDrawerSection(section);
    setDrawerOpen(true);
    trackAdminUiEvent("drawer.opened", { section });
  };

  const handleCopyShare = async () => {
    const text = buildSocialCopyText({ title: item.title, slug: item.slug, summary: extractSummaryFromRaw(draft) });
    try {
      await navigator.clipboard.writeText(text);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
      void recordShareMutation.mutateAsync({ channel: "copy", angle: "overview" }).catch(() => undefined);
    } catch {
      setErrorMessage("复制失败，请手动复制链接");
    }
  };

  const showReleaseStrip = Boolean(
    inFlight ||
      errorMessage ||
      statusMessage ||
      stage === "FAILED" ||
      stage === "UNKNOWN" ||
      stage === "PUBLISHED",
  );

  const stripTone =
    errorMessage || stage === "FAILED"
      ? "err"
      : stage === "UNKNOWN"
        ? "warn"
        : stage === "PUBLISHED" && !inFlight
          ? "ok"
          : "";

  return (
    <>
      <div className="editor-bar">
        <div className="editor-bar-left">
          <Link to={R.content} className="icon-btn" aria-label="返回文章列表">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>文章</span>
          </Link>
          <span className="muted mono" style={{ fontSize: 12 }}>
            {item.slug}
          </span>
          <div className="mode-switch" role="tablist" aria-label="编辑与预览切换">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "edit"}
              className={mode === "edit" ? "is-active" : ""}
              onClick={() => setMode("edit")}
            >
              编辑
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "preview"}
              className={mode === "preview" ? "is-active" : ""}
              onClick={() => setMode("preview")}
            >
              预览
            </button>
          </div>
        </div>

        <div className="editor-bar-right">
          {isDirty ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={saveMutation.isPending}
              onClick={() => void performSave()}
            >
              <Save size={14} aria-hidden="true" />
              {saveMutation.isPending ? "保存中…" : "保存"}
            </button>
          ) : null}

          <button
            type="button"
            className={isDirty || isLive ? "btn" : "btn btn-primary"}
            disabled={inFlight || publishing}
            onClick={() => {
              setErrorMessage(null);
              setPublishOpen(true);
              trackAdminUiEvent("publish.flow_started", { slug: item.slug, dirty: isDirty });
            }}
          >
            <UploadCloud size={14} aria-hidden="true" />
            {inFlight ? "发布中…" : isLive ? "重新发布" : "发布"}
          </button>

          <button
            type="button"
            className="icon-btn"
            aria-label="更多操作"
            title="历史 · AI 建议 · 宣发 · 删除"
            onClick={() => openDrawer("history")}
          >
            <MoreHorizontal size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 按需显现的状态条：平时 0 像素，仅在发布中/刚保存/失败/未知/已确证时显现 */}
      {showReleaseStrip ? (
        <div className={`release-strip ${stripTone}`.trim()} role="status">
          <span>
            {errorMessage
              ? errorMessage
              : statusMessage
                ? statusMessage
                : inFlight
                  ? `发布进行中（${stage}），后台自动核验中…`
                  : stage === "UNKNOWN"
                    ? "上次发布结果待核对，请点击核对确认状态"
                    : stage === "FAILED"
                      ? `上次发布失败：${release?.errorCode ?? "请重试"}`
                      : "已在线上确证"}
          </span>
          <div className="action-row">
            {stage === "PUBLISHED" && !inFlight ? (
              <>
                <a
                  className="btn btn-ghost"
                  href={getPublicPostUrl(item.slug)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={13} aria-hidden="true" /> 打开文章
                </a>
                <button type="button" className="btn btn-ghost" onClick={() => void handleCopyShare()}>
                  {copiedShare ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                  {copiedShare ? "已复制" : "复制推文"}
                </button>
              </>
            ) : null}
            {release && (stage === "UNKNOWN" || stage === "VERIFYING") ? (
              <button
                type="button"
                className="btn"
                disabled={reconcileMutation.isPending || verifyMutation.isPending}
                onClick={() => {
                  const fn =
                    stage === "UNKNOWN"
                      ? reconcileMutation.mutateAsync(release.id)
                      : verifyMutation.mutateAsync(release.id);
                  void fn.then(() => {
                    void latestRelease.refetch();
                    void versionQuery.refetch();
                  });
                }}
              >
                <RefreshCw size={13} aria-hidden="true" /> 立即核对
              </button>
            ) : null}
            {release && (stage === "PREPARED" || stage === "UNKNOWN") ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={cancelMutation.isPending}
                onClick={() =>
                  void cancelMutation.mutateAsync(release.id).then(() => {
                    void latestRelease.refetch();
                  })
                }
              >
                取消发布单
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 按需显现：CAS 409 冲突双栏解决 */}
      {conflict ? (
        <section className="panel" role="alert">
          <div className="panel-heading">
            <h2>检测到外部更新冲突</h2>
            <div className="action-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void performSave(conflict.remoteHash)}
              >
                保留我的并覆盖
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setDraft(conflict.remoteRaw);
                  setSavedRaw(conflict.remoteRaw);
                  setBaseHash(conflict.remoteHash);
                  setConflict(null);
                  setStatusMessage("已采用远端最新版本");
                }}
              >
                采用远端版本
              </button>
            </div>
          </div>
          <div className="conflict-grid">
            <div>
              <strong className="muted">我的编辑</strong>
              <pre>{draft}</pre>
            </div>
            <div>
              <strong className="muted">远端最新</strong>
              <pre>{conflict.remoteRaw}</pre>
            </div>
          </div>
        </section>
      ) : null}

      {mode === "edit" ? (
        <textarea
          aria-label="文章正文"
          className="editor-canvas"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setStatusMessage(null);
          }}
        />
      ) : (
        <div className="editor-preview">
          <MarkdownPreview raw={draft} />
        </div>
      )}

      {/* 一键发布轻浮层：唯一必填 = 一句公开变更说明 */}
      <ModalDialog
        open={publishOpen}
        title="发布上线"
        onClose={() => {
          setPublishOpen(false);
          trackAdminUiEvent("publish.flow_abandoned", { slug: item.slug, reason: "cancel" });
        }}
      >
        <form onSubmit={(e) => void handleOneClickPublish(e)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            变更说明（将公开显示在版本历史中）
            <input
              type="text"
              autoFocus
              required
              placeholder="例如：补充一线案例 / 修正错别字"
              value={versionNote}
              onChange={(e) => setVersionNote(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void handleOneClickPublish(e);
                }
              }}
            />
          </label>
          {errorMessage ? (
            <p className="error-text" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <div className="action-row" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPublishOpen(false);
                trackAdminUiEvent("publish.flow_abandoned", { slug: item.slug, reason: "cancel" });
              }}
            >
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={publishing || !versionNote.trim()}>
              <UploadCloud size={14} aria-hidden="true" />
              {publishing ? "正在推送…" : "发布上线"}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* 右侧按需滑出抽屉：历史 / AI 建议 / 宣发 / 删除 */}
      <SlideDrawer open={drawerOpen} title="文章选项" onClose={() => setDrawerOpen(false)}>
        <div className="chip-row" role="tablist" aria-label="抽屉功能">
          {(
            [
              ["history", "历史", History],
              ["ai", "AI 建议", Sparkles],
              ["share", "宣发", Share2],
              ["delete", "删除", Trash2],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              className={`chip ${drawerSection === key ? "is-active" : ""}`}
              onClick={() => openDrawer(key)}
            >
              <Icon size={12} aria-hidden="true" style={{ marginRight: 4 }} />
              {label}
            </button>
          ))}
        </div>

        {drawerSection === "history" ? (
          <ContentHistoryPanel
            slug={item.slug}
            onRestore={(raw, fromVersion) => {
              setDraft(raw);
              setDrawerOpen(false);
              setStatusMessage(`已载入 v${fromVersion} 内容为草稿，保存并发布后成为新版本`);
            }}
          />
        ) : null}

        {drawerSection === "ai" ? (
          <ContentChangeReviewPanel
            slug={item.slug}
            currentDoc={{ ...item, raw: draft, hash: baseHash }}
            onApplied={() => {
              void fetchContentDetail(item.slug).then((fresh) => {
                setDraft(fresh.raw);
                setSavedRaw(fresh.raw);
                setBaseHash(fresh.hash || "");
                setDrawerOpen(false);
              });
              void changesQuery.refetch();
            }}
          />
        ) : null}

        {drawerSection === "share" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <pre className="panel mono" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {buildSocialCopyText({ title: item.title, slug: item.slug, summary: extractSummaryFromRaw(draft) })}
            </pre>
            <div className="action-row">
              <button type="button" className="btn btn-primary" onClick={() => void handleCopyShare()}>
                {copiedShare ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                {copiedShare ? "已复制文案" : "复制全文案"}
              </button>
              <a
                className="btn"
                href={buildXShareIntentUrl({ title: item.title, slug: item.slug })}
                target="_blank"
                rel="noreferrer"
                onClick={() => void recordShareMutation.mutateAsync({ channel: "x", angle: "overview" }).catch(() => undefined)}
              >
                <ExternalLink size={14} aria-hidden="true" /> 去 X 发帖
              </a>
            </div>
          </div>
        ) : null}

        {drawerSection === "delete" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p className="muted">删除仅移除本地草稿区 `content/log/{item.slug}`，公开已发布历史保留。</p>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                setDrawerOpen(false);
                setDeleteOpen(true);
              }}
            >
              <Trash2 size={14} aria-hidden="true" /> 删除草稿
            </button>
          </div>
        ) : null}
      </SlideDrawer>

      {/* 删除二次确认：safe Cancel 默认聚焦 */}
      <ModalDialog open={deleteOpen} title="确认删除草稿？" onClose={() => setDeleteOpen(false)}>
        <p className="muted">将删除 `content/log/{item.slug}`，未保存修改无法找回。</p>
        <div className="action-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" autoFocus onClick={() => setDeleteOpen(false)}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={deleteMutation.isPending}
            onClick={() =>
              void deleteMutation.mutateAsync({ slug: item.slug }).then(() => {
                setDeleteOpen(false);
                navigate(R.content, { replace: true });
              })
            }
          >
            {deleteMutation.isPending ? "删除中…" : "确认删除"}
          </button>
        </div>
      </ModalDialog>

      {/* 未保存离页拦截 */}
      <ModalDialog
        open={blocker.state === "blocked"}
        title="有未保存的改动"
        dismissible={false}
        onClose={() => blocker.reset?.()}
      >
        <p className="muted">离开当前页面将丢失刚写的内容。</p>
        <div className="action-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={() => blocker.proceed?.()}>
            放弃并离开
          </button>
          <button type="button" className="btn btn-primary" autoFocus onClick={() => blocker.reset?.()}>
            留下继续编辑
          </button>
        </div>
      </ModalDialog>
    </>
  );
}
