import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Check, Code2, Copy, ExternalLink, History, MoreHorizontal, RefreshCw, Save, Share2, SlidersHorizontal, Sparkles, Trash2, UploadCloud,
} from "lucide-react";
import type { ContentVisibility, OpsContentDetail } from "@walker/shared";
import { buildSocialCopyText, buildXShareIntentUrl, extractSummaryFromRaw, getPublicPostUrl } from "@walker/shared";
import { ApiError } from "../../api/http";
import {
  fetchContentDetail, useCancelContentRelease, useContentChanges, useContentDetail, useContentVersion,
  useDeleteContent, useLatestContentRelease, usePrepareContentRelease, useReconcileContentRelease,
  useRecordSocialShare, useSaveContent, useTriggerContentRelease, useVerifyContentRelease,
} from "../../api/queries";
import { trackAdminUiEvent } from "../../api/telemetry";
import { MarkdownPreview } from "../../components/MarkdownPreview";
import { ModalDialog } from "../../components/ModalDialog";
import { SlideDrawer } from "../../components/SlideDrawer";
import { ErrorState, LoadingState } from "../../components/States";
import { DEFAULT_CONTENT_TYPES } from "../../shared/content-types";
import { parseDocFrontmatter, promoteDraftForPublish, updateDocFrontmatter } from "../../shared/frontmatter";
import { ADMIN_ROUTES as R } from "../../shared/routes";
import { ContentChangeReviewPanel } from "./ContentChangeReviewPanel";
import { ContentHistoryPanel } from "./ContentHistoryPanel";

type DrawerSection = "meta" | "history" | "ai" | "share" | "delete";

export function ContentDetailPage() {
  const { slug = "" } = useParams();
  const query = useContentDetail(slug);
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} retry={query.refetch} />;
  return query.data?.data ? <ContentCanvas key={query.data.data.slug} item={query.data.data} /> : null;
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
  const [rawYamlMode, setRawYamlMode] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [versionNote, setVersionNote] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSection, setDrawerSection] = useState<DrawerSection>("meta");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [conflict, setConflict] = useState<{ remoteRaw: string; remoteHash: string } | null>(null);
  const [justPublished, setJustPublished] = useState(false);

  const parsed = useMemo(() => parseDocFrontmatter(draft), [draft]);
  const [tagsInput, setTagsInput] = useState(() => parseDocFrontmatter(item.raw).tags.join(", "));
  const displayTitle = parsed.title || item.title;

  // 仅真正提交中（COMMITTING/PUSHED）或 10 分钟内的新 VERIFYING 才按 5s 轮询；超时旧 VERIFYING 绝不无限轮询或锁死发布按钮
  const [pollActive, setPollActive] = useState(false);
  const latestRelease = useLatestContentRelease(item.slug, { refetchInterval: pollActive ? 5_000 : false });
  const versionQuery = useContentVersion(item.slug, { refetchInterval: pollActive ? 5_000 : false });
  const changesQuery = useContentChanges(item.slug, { enabled: drawerOpen && drawerSection === "ai" });

  const release = latestRelease.data;
  const stage = release?.stage;
  const isGitBusy = stage === "COMMITTING" || stage === "PUSHED";
  const verifyingFresh =
    stage === "VERIFYING" &&
    Boolean(release?.updatedAt) &&
    Date.now() - Date.parse(release!.updatedAt) < 10 * 60_000;
  const isStaleVerifying = stage === "VERIFYING" && !verifyingFresh;

  useEffect(() => {
    setPollActive(isGitBusy || verifyingFresh || (justPublished && stage !== "PUBLISHED" && stage !== "FAILED"));
  }, [isGitBusy, verifyingFresh, justPublished, stage]);

  const isDirty = draft !== savedRaw;
  const isLive = Boolean(versionQuery.data?.publishedHash && versionQuery.data.publishedHash === versionQuery.data.workingHash) && !isDirty && !isGitBusy;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (isDirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const patchDoc = (patch: Parameters<typeof updateDocFrontmatter>[1]) => {
    setDraft((prev) => updateDocFrontmatter(prev, patch));
    setStatusMessage(null);
    setJustPublished(false);
  };

  const performSave = async (overrideHash?: string, rawOverride?: string): Promise<boolean> => {
    const nextRaw = rawOverride ?? draft;
    setErrorMessage(null); setStatusMessage(null);
    if (item.type === "project") {
      const fm = nextRaw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
      const st = fm.match(/^status:\s*(.*)$/m);
      if (st && !st[1].trim()) { setErrorMessage("项目字段校验失败：status 不能为空"); return false; }
    }
    const t0 = Date.now();
    try {
      const updated = await saveMutation.mutateAsync({ slug: item.slug, raw: nextRaw, expectedHash: overrideHash ?? (baseHash || null) });
      setSavedRaw(updated.raw); setDraft(updated.raw);
      setTagsInput(parseDocFrontmatter(updated.raw).tags.join(", "));
      setBaseHash(updated.hash || ""); setConflict(null); setStatusMessage("已保存");
      trackAdminUiEvent("editor.save_completed", { durationMs: Date.now() - t0, conflict: false });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 409) {
        trackAdminUiEvent("editor.save_completed", { durationMs: Date.now() - t0, conflict: true });
        try {
          const latest = await fetchContentDetail(item.slug);
          setConflict({ remoteRaw: latest.raw, remoteHash: latest.hash || "" });
        } catch { setErrorMessage("文件已被外部更新，请刷新后再试"); }
        return false;
      }
      setErrorMessage(err instanceof Error ? err.message : "保存失败");
      return false;
    }
  };

  const openPublish = () => {
    setErrorMessage(null); setPublishOpen(true);
    trackAdminUiEvent("publish.flow_started", { slug: item.slug, dirty: isDirty });
  };

  // 全局快捷键仅挂载一次，通过 ref 读取最新状态避免每次按键重绑
  const shortcutRef = useRef({ save: () => {}, publish: () => {} });
  shortcutRef.current = {
    save: () => { if (isDirty && !saveMutation.isPending) void performSave(); },
    publish: openPublish,
  };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); shortcutRef.current.save(); }
      else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") { e.preventDefault(); shortcutRef.current.publish(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleOneClickPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    const note = versionNote.trim();
    if (!note) return setErrorMessage("请填写一句公开变更说明");
    setPublishing(true); setErrorMessage(null);
    const t0 = Date.now();
    try {
      const promoted = promoteDraftForPublish(draft, item.slug);
      if (promoted.changed || isDirty) {
        const ok = await performSave(undefined, promoted.raw);
        if (!ok) { setPublishOpen(false); trackAdminUiEvent("publish.flow_abandoned", { slug: item.slug, reason: "error" }); return; }
      }
      const prepared = await prepareMutation.mutateAsync({
        slug: item.slug, versionNote: note, requestKey: `pub-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      });
      await triggerMutation.mutateAsync({ slug: item.slug, releaseId: prepared.id });
      setPublishOpen(false); setVersionNote(""); setJustPublished(true);
      setStatusMessage("已推送到 GitHub，正在自动等待线上确证…");
      trackAdminUiEvent("publish.flow_completed", { slug: item.slug, durationMs: Date.now() - t0 });
      void latestRelease.refetch(); void versionQuery.refetch();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "发布失败");
      trackAdminUiEvent("publish.flow_abandoned", { slug: item.slug, reason: "error" });
    } finally { setPublishing(false); }
  };

  const openDrawer = (section: DrawerSection) => {
    if (section === "meta") setTagsInput(parsed.tags.join(", "));
    setDrawerSection(section); setDrawerOpen(true);
    trackAdminUiEvent("drawer.opened", { section });
  };

  const handleCopyShare = async () => {
    try {
      await navigator.clipboard.writeText(buildSocialCopyText({ title: displayTitle, slug: item.slug, summary: extractSummaryFromRaw(draft) }));
      setCopiedShare(true); setTimeout(() => setCopiedShare(false), 2000);
      void recordShareMutation.mutateAsync({ channel: "copy", angle: "overview" }).catch(() => undefined);
    } catch { setErrorMessage("复制失败，请手动复制链接"); }
  };

  // 按需显现 + 绝不撒谎：未保存编辑态（isDirty）下绝不显示「已在线上确证」，平时已发布文章 0 像素占位
  const showPublishedConfirm = justPublished && stage === "PUBLISHED" && !isDirty && !isGitBusy;
  const showStrip = Boolean(
    errorMessage || statusMessage || isGitBusy || verifyingFresh || (!isDirty && (isStaleVerifying || stage === "FAILED" || stage === "UNKNOWN")) || showPublishedConfirm,
  );
  const stripTone = errorMessage || stage === "FAILED" ? "err" : stage === "UNKNOWN" || isStaleVerifying ? "warn" : showPublishedConfirm ? "ok" : "";
  const stripText =
    errorMessage ??
    statusMessage ??
    (isGitBusy || verifyingFresh
      ? `发布进行中（${stage}），后台自动核验中…`
      : isStaleVerifying
        ? "上次发布超时未确证，可点击核对或直接重新发布"
        : stage === "UNKNOWN"
          ? "上次发布结果待核对，请点击核对确认状态"
          : stage === "FAILED"
            ? `上次发布失败：${release?.errorCode ?? "请重试"}`
            : "已在线上确证");

  return (
    <>
      <div className="editor-bar">
        <div className="editor-bar-left">
          <Link to={R.content} className="icon-btn" aria-label="返回文章列表"><ArrowLeft size={16} aria-hidden="true" /><span>文章</span></Link>
          <span className="muted mono">{item.slug}</span>
          {parsed.visibility === "draft" ? <span className="badge amber">草稿</span> : parsed.visibility === "private" ? <span className="badge">私密</span> : null}
          <div className="mode-switch" role="tablist" aria-label="编辑与预览切换">
            <button type="button" role="tab" aria-selected={mode === "edit"} className={mode === "edit" ? "is-active" : ""} onClick={() => setMode("edit")}>编辑</button>
            <button type="button" role="tab" aria-selected={mode === "preview"} className={mode === "preview" ? "is-active" : ""} onClick={() => setMode("preview")}>预览</button>
          </div>
        </div>
        <div className="editor-bar-right">
          {isDirty ? (
            <button type="button" className="btn btn-primary" disabled={saveMutation.isPending} onClick={() => void performSave()}>
              <Save size={14} aria-hidden="true" />{saveMutation.isPending ? "保存中…" : "保存"}
            </button>
          ) : null}
          <button type="button" className={isDirty || isLive ? "btn" : "btn btn-primary"} disabled={isGitBusy || publishing} onClick={openPublish}>
            <UploadCloud size={14} aria-hidden="true" />{isGitBusy || publishing ? "发布中…" : isLive || isStaleVerifying ? "重新发布" : "发布"}
          </button>
          <button type="button" className="icon-btn" aria-label="更多操作" title="元信息 · 历史 · AI 建议 · 宣发 · 删除" onClick={() => openDrawer("meta")}>
            <MoreHorizontal size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      {showStrip ? (
        <div className={`release-strip ${stripTone}`.trim()} role="status">
          <span>{stripText}</span>
          <div className="action-row">
            {showPublishedConfirm ? (
              <>
                <a className="btn btn-ghost" href={getPublicPostUrl(item.slug)} target="_blank" rel="noreferrer"><ExternalLink size={13} /> 打开文章</a>
                <button type="button" className="btn btn-ghost" onClick={() => void handleCopyShare()}>
                  {copiedShare ? <Check size={13} /> : <Copy size={13} />}{copiedShare ? "已复制" : "复制推文"}
                </button>
              </>
            ) : null}
            {release && (stage === "UNKNOWN" || stage === "VERIFYING") ? (
              <button type="button" className="btn" disabled={reconcileMutation.isPending || verifyMutation.isPending} onClick={() => {
                void (stage === "UNKNOWN" ? reconcileMutation.mutateAsync(release.id) : verifyMutation.mutateAsync(release.id)).then(() => { void latestRelease.refetch(); void versionQuery.refetch(); });
              }}><RefreshCw size={13} /> 立即核对</button>
            ) : null}
            {release && (stage === "PREPARED" || stage === "UNKNOWN") ? (
              <button type="button" className="btn btn-ghost" disabled={cancelMutation.isPending} onClick={() => void cancelMutation.mutateAsync(release.id).then(() => void latestRelease.refetch())}>取消发布单</button>
            ) : null}
          </div>
        </div>
      ) : null}

      {conflict ? (
        <section className="panel" role="alert">
          <div className="panel-heading">
            <h2>检测到外部更新冲突</h2>
            <div className="action-row">
              <button type="button" className="btn btn-primary" onClick={() => void performSave(conflict.remoteHash)}>保留我的并覆盖</button>
              <button type="button" className="btn" onClick={() => {
                setDraft(conflict.remoteRaw); setSavedRaw(conflict.remoteRaw);
                setTagsInput(parseDocFrontmatter(conflict.remoteRaw).tags.join(", "));
                setBaseHash(conflict.remoteHash); setConflict(null); setStatusMessage("已采用远端最新版本");
              }}>采用远端版本</button>
            </div>
          </div>
          <div className="conflict-grid">
            <div><strong className="muted">我的编辑</strong><pre>{draft}</pre></div>
            <div><strong className="muted">远端最新</strong><pre>{conflict.remoteRaw}</pre></div>
          </div>
        </section>
      ) : null}

      {mode === "edit" ? (
        rawYamlMode || !parsed.hasFrontmatter ? (
          <div className="editor-sheet">
            {rawYamlMode ? (
              <div className="editor-raw-banner">
                <span className="muted">正在编辑原始 YAML + Markdown 源码</span>
                <button type="button" className="btn btn-ghost" onClick={() => { setTagsInput(parsed.tags.join(", ")); setRawYamlMode(false); }}>返回纯净画布</button>
              </div>
            ) : null}
            <textarea aria-label={rawYamlMode ? "原始 Markdown 源码" : "文章正文"} className="editor-canvas" value={draft} onChange={(e) => { setDraft(e.target.value); setStatusMessage(null); setJustPublished(false); }} />
          </div>
        ) : (
          <div className="editor-sheet">
            <input type="text" aria-label="文章标题" className="editor-title-input" placeholder="无标题文章" value={parsed.title} onChange={(e) => patchDoc({ title: e.target.value })} />
            <textarea aria-label="文章正文" className="editor-canvas editor-canvas-body" placeholder="开始写作 Markdown 正文…" value={parsed.body} onChange={(e) => patchDoc({ body: e.target.value })} />
          </div>
        )
      ) : (
        <div className="editor-preview">
          <h1 className="editor-preview-title">{displayTitle}</h1>
          <MarkdownPreview raw={draft} />
        </div>
      )}

      <ModalDialog open={publishOpen} title="发布上线" onClose={() => { setPublishOpen(false); trackAdminUiEvent("publish.flow_abandoned", { slug: item.slug, reason: "cancel" }); }}>
        <form onSubmit={(e) => void handleOneClickPublish(e)} className="stack">
          {parsed.visibility === "draft" || parsed.published === false ? (
            <p className="notice" style={{ margin: 0 }}>当前为草稿，发布上线时将自动转为公开可见。</p>
          ) : parsed.visibility === "private" ? (
            <p className="notice" style={{ margin: 0 }}>当前为私密文章，不会在公网展示；如需公开请先在「元信息」改为公开。</p>
          ) : null}
          <label className="field-col">
            变更说明（将公开显示在版本历史中）
            <input
              type="text" autoFocus required placeholder="例如：补充一线案例 / 修正错别字" value={versionNote}
              onChange={(e) => setVersionNote(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void handleOneClickPublish(e); } }}
            />
          </label>
          {errorMessage ? <p className="error-text" role="alert">{errorMessage}</p> : null}
          <div className="action-row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => { setPublishOpen(false); trackAdminUiEvent("publish.flow_abandoned", { slug: item.slug, reason: "cancel" }); }}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={publishing || !versionNote.trim()}><UploadCloud size={14} />{publishing ? "正在推送…" : "发布上线"}</button>
          </div>
        </form>
      </ModalDialog>

      <SlideDrawer open={drawerOpen} title="文章选项" onClose={() => setDrawerOpen(false)}>
        <div className="chip-row" role="tablist" aria-label="抽屉功能">
          {([["meta", "元信息", SlidersHorizontal], ["history", "历史", History], ["ai", "AI 建议", Sparkles], ["share", "宣发", Share2], ["delete", "删除", Trash2]] as const).map(([key, label, Icon]) => (
            <button key={key} type="button" className={`chip ${drawerSection === key ? "is-active" : ""}`} onClick={() => openDrawer(key)}>
              <Icon size={12} aria-hidden="true" style={{ marginRight: 4 }} />{label}
            </button>
          ))}
        </div>

        {drawerSection === "meta" ? (
          <div className="stack">
            <label className="field-col">公开摘要<textarea rows={3} value={parsed.summary} onChange={(e) => patchDoc({ summary: e.target.value })} placeholder="一句话概括文章价值" /></label>
            <label className="field-col">文章类型
              <select value={parsed.type} onChange={(e) => patchDoc({ type: e.target.value })}>
                {DEFAULT_CONTENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="field-col">可见性
              <select value={parsed.visibility} onChange={(e) => patchDoc({ visibility: e.target.value as ContentVisibility })}>
                <option value="public">公开 (public)</option>
                <option value="draft">草稿 (draft)</option>
                <option value="private">私密 (private)</option>
              </select>
            </label>
            <label className="field-col">标签（逗号分隔）
              <input type="text" value={tagsInput} placeholder="例如：架构, 极简" onChange={(e) => { setTagsInput(e.target.value); patchDoc({ tags: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) }); }} />
            </label>
            <button type="button" className="btn" onClick={() => { setRawYamlMode((v) => !v); setDrawerOpen(false); }}>
              <Code2 size={14} />{rawYamlMode ? "切回纯净写作画布" : "查看 / 编辑原始 YAML 源码"}
            </button>
          </div>
        ) : drawerSection === "history" ? (
          <ContentHistoryPanel slug={item.slug} onRestore={(raw, v) => { setDraft(raw); setTagsInput(parseDocFrontmatter(raw).tags.join(", ")); setDrawerOpen(false); setStatusMessage(`已载入 v${v} 内容为草稿，保存并发布后成为新版本`); }} />
        ) : drawerSection === "ai" ? (
          <ContentChangeReviewPanel slug={item.slug} currentDoc={{ ...item, raw: draft, hash: baseHash }} onApplied={() => {
            void fetchContentDetail(item.slug).then((fresh) => {
              setDraft(fresh.raw); setSavedRaw(fresh.raw); setTagsInput(parseDocFrontmatter(fresh.raw).tags.join(", ")); setBaseHash(fresh.hash || ""); setDrawerOpen(false);
            });
            void changesQuery.refetch();
          }} />
        ) : drawerSection === "share" ? (
          <div className="stack">
            <pre className="panel mono" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{buildSocialCopyText({ title: displayTitle, slug: item.slug, summary: extractSummaryFromRaw(draft) })}</pre>
            <div className="action-row">
              <button type="button" className="btn btn-primary" onClick={() => void handleCopyShare()}>{copiedShare ? <Check size={14} /> : <Copy size={14} />}{copiedShare ? "已复制文案" : "复制全文案"}</button>
              <a className="btn" href={buildXShareIntentUrl({ title: displayTitle, slug: item.slug })} target="_blank" rel="noreferrer" onClick={() => void recordShareMutation.mutateAsync({ channel: "x", angle: "overview" }).catch(() => undefined)}><ExternalLink size={14} /> 去 X 发帖</a>
            </div>
          </div>
        ) : (
          <div className="stack">
            <p className="muted">删除仅移除本地草稿区 `content/log/{item.slug}`，公开已发布历史保留。</p>
            <button type="button" className="btn btn-danger" onClick={() => { setDrawerOpen(false); setDeleteOpen(true); }}><Trash2 size={14} /> 删除草稿</button>
          </div>
        )}
      </SlideDrawer>

      <ModalDialog open={deleteOpen} title="确认删除草稿？" onClose={() => setDeleteOpen(false)}>
        <p className="muted">将删除 `content/log/{item.slug}`，未保存修改无法找回。</p>
        <div className="action-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" autoFocus onClick={() => setDeleteOpen(false)}>取消</button>
          <button type="button" className="btn btn-danger" disabled={deleteMutation.isPending} onClick={() => void deleteMutation.mutateAsync({ slug: item.slug }).then(() => { setDeleteOpen(false); navigate(R.content, { replace: true }); })}>
            {deleteMutation.isPending ? "删除中…" : "确认删除"}
          </button>
        </div>
      </ModalDialog>

      <ModalDialog open={blocker.state === "blocked"} title="有未保存的改动" dismissible={false} onClose={() => blocker.reset?.()}>
        <p className="muted">离开当前页面将丢失刚写的内容。</p>
        <div className="action-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={() => blocker.proceed?.()}>放弃并离开</button>
          <button type="button" className="btn btn-primary" autoFocus onClick={() => blocker.reset?.()}>留下继续编辑</button>
        </div>
      </ModalDialog>
    </>
  );
}
