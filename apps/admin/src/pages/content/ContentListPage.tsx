import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CloudUpload, Plus, RefreshCw, Search } from "lucide-react";
import { isValidContentSlug } from "@walker/shared";
import {
  useContent,
  useContentDraftBackup,
  useContentSyncPull,
  useContentSyncStatus,
  useSaveContent,
} from "../../api/queries";
import { ModalDialog } from "../../components/ModalDialog";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { DEFAULT_CONTENT_TYPES } from "../../shared/content-types";
import { timeLabel } from "../../shared/labels";
import { ADMIN_ROUTES as R } from "../../shared/routes";

type FilterMode = "all" | "draft" | "live";
type BadgeState = "verified" | "indexed" | "pending" | "private" | "draft";

const BADGE_META: Record<BadgeState, { cls: string; dot: string; text: string; tip?: string }> = {
  verified: { cls: "badge green", dot: "status-dot live", text: "已上线", tip: "后台发布单已线上确证" },
  indexed: { cls: "badge", dot: "status-dot live", text: "已公开", tip: "已进入公开问答索引（暂无后台发布单记录）" },
  pending: { cls: "badge", dot: "status-dot inflight", text: "待核验", tip: "Git 已公开且无本地改动，尚未同步进问答索引/发布单确证" },
  private: { cls: "badge", dot: "status-dot", text: "私密" },
  draft: { cls: "badge amber", dot: "status-dot draft", text: "草稿" },
};

function autoSlug(text: string, existing?: ReadonlySet<string>): string {
  const dm = text.match(/\b(20\d{2})[-_./]?(\d{1,2})[-_./]?(\d{1,2})\b/);
  const latin = text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").trim().replace(/\s+/g, "-");
  const base = isValidContentSlug(latin)
    ? latin
    : dm
      ? `${dm[1]}-${dm[2].padStart(2, "0")}-${dm[3].padStart(2, "0")}-note`
      : `post-${new Date().toISOString().slice(0, 10)}`;
  if (!existing?.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function ContentListPage() {
  const query = useContent();
  const syncQuery = useContentSyncStatus();
  const pullMutation = useContentSyncPull();
  const backupMutation = useContentDraftBackup();
  const saveMutation = useSaveContent();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [newType, setNewType] = useState("knowledge");
  const [createError, setCreateError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(() => (location.state as { notice?: string } | null)?.notice ?? null);

  const filter: FilterMode = params.get("filter") === "draft" || params.get("filter") === "live" ? (params.get("filter") as FilterMode) : "all";
  const setFilter = (next: FilterMode) => {
    const p = new URLSearchParams(params);
    if (next === "all") p.delete("filter");
    else p.set("filter", next);
    setParams(p, { replace: true });
  };

  const items = query.data?.data ?? [];
  const existingSlugs = useMemo(() => new Set(items.map((i) => i.slug)), [items]);
  const dirtyCount = syncQuery.data?.dirtyFiles.length ?? 0;
  const behindCount = syncQuery.data?.behind ?? 0;
  const conflictCount = syncQuery.data?.conflicts?.length ?? 0;

  const badgeOf = (item: (typeof items)[number]): BadgeState => {
    const { publishedHash, currentPublicHash, indexedHash } = item.publication;
    if (publishedHash && currentPublicHash && publishedHash === currentPublicHash) return "verified";
    if (item.visibility === "private") return "private";
    if (item.visibility === "public" && !item.dirty && item.missing.length === 0) {
      return indexedHash && currentPublicHash && indexedHash === currentPublicHash ? "indexed" : "pending";
    }
    return "draft";
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const state = badgeOf(item);
      const isPublic = state === "verified" || state === "indexed" || state === "pending";
      if ((filter === "live" && !isPublic) || (filter === "draft" && isPublic)) return false;
      return !q || item.title.toLowerCase().includes(q) || item.slug.toLowerCase().includes(q);
    });
  }, [items, filter, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    const slug = (newSlug.trim() || autoSlug(title, existingSlugs)).toLowerCase();
    if (!title) return setCreateError("请填写标题");
    if (!isValidContentSlug(slug)) return setCreateError("Slug 仅支持小写字母、数字和连字符");
    setCreateError(null);
    const today = new Date().toISOString().slice(0, 10);
    // 正文留空：标题已存 frontmatter 并由画布/前台 <h1> 渲染，避免双 H1 重复
    const raw = [
      "---", `title: ${JSON.stringify(title)}`, `date: ${today}`, `updated: ${today}`, `type: ${newType}`,
      "form: note", "domain: thinking", "intent: clarify", "valueMode: insight",
      `summary: ${JSON.stringify(`${title} · ${slug}`)}`, "visibility: draft",
      "aiUsePolicy:", "  level: AI-2", "  readable: true", "  citable: true", "  actionable: false",
      "---", "", "",
    ].join("\n");
    try {
      await saveMutation.mutateAsync({ slug, raw, expectedHash: null });
      setCreateOpen(false); setNewTitle(""); setNewSlug(""); setSlugTouched(false);
      navigate(R.contentDetail(slug));
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "创建失败");
    }
  };

  const runSync = async (fn: () => Promise<{ message: string }>, refreshContent = false) => {
    setSyncNotice(null);
    try {
      const res = await fn();
      setSyncNotice(res.message);
      if (refreshContent) void query.refetch();
      void syncQuery.refetch();
    } catch (err) {
      setSyncNotice(err instanceof Error ? err.message : "同步操作失败");
    }
  };

  return (
    <>
      <div className="list-toolbar">
        <div className="search-box">
          <Search size={15} className="muted" aria-hidden="true" />
          <input type="search" aria-label="搜索文章" placeholder="搜索标题或 slug…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="chip-row" role="group" aria-label="按状态筛选">
          {([["all", "全部"], ["draft", "草稿"], ["live", "已公开"]] as const).map(([key, label]) => (
            <button key={key} type="button" className={`chip ${filter === key ? "is-active" : ""}`} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={15} aria-hidden="true" />新建文章</button>
      </div>

      {dirtyCount > 0 || behindCount > 0 || conflictCount > 0 || syncNotice ? (
        <div className="release-strip warn">
          <span>
            {syncNotice ?? (conflictCount > 0 ? `检测到 ${conflictCount} 篇同篇冲突，请打开对应文章核对` : behindCount > 0 ? `GitHub 有 ${behindCount} 个新提交待拉取` : `当前有 ${dirtyCount} 篇本地草稿未上线`)}
          </span>
          <div className="action-row">
            {behindCount > 0 ? (
              <button type="button" className="btn" disabled={pullMutation.isPending} onClick={() => void runSync(() => pullMutation.mutateAsync(), true)}>
                <RefreshCw size={13} aria-hidden="true" />{pullMutation.isPending ? "拉取中…" : "拉取最新"}
              </button>
            ) : null}
            {dirtyCount > 0 ? (
              <button type="button" className="btn" disabled={backupMutation.isPending} onClick={() => void runSync(() => backupMutation.mutateAsync())}>
                <CloudUpload size={13} aria-hidden="true" />{backupMutation.isPending ? "备份中…" : `备份草稿 (${dirtyCount})`}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} retry={query.refetch} /> : filtered.length === 0 ? (
        <EmptyState title={items.length === 0 ? "还没有文章" : "没有匹配的文章"}>
          {items.length === 0 ? <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>新建第一篇文章</button> : null}
        </EmptyState>
      ) : (
        <div className="article-list">
          {filtered.map((item) => {
            const m = BADGE_META[badgeOf(item)];
            return (
              <Link key={item.slug} to={R.contentDetail(item.slug)} className="article-row">
                <div className="article-row-main">
                  <span className="article-row-title">{item.title}</span>
                  <span className="article-row-meta"><span className="mono">{item.slug}</span><span>·</span><span>{timeLabel(item.updatedAt)}</span></span>
                </div>
                <span className={m.cls} title={m.tip}>
                  <span className={m.dot} aria-hidden="true" />{m.text}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <ModalDialog open={createOpen} title="新建文章" onClose={() => setCreateOpen(false)}>
        <form onSubmit={(e) => void handleCreate(e)} className="stack">
          <label className="field-col">
            标题
            <input type="text" autoFocus required placeholder="输入文章标题" value={newTitle} onChange={(e) => { setNewTitle(e.target.value); if (!slugTouched) setNewSlug(autoSlug(e.target.value, existingSlugs)); }} />
          </label>
          <label className="field-col">
            路径标识 (slug)
            <input type="text" required className="mono" value={newSlug} onChange={(e) => { setSlugTouched(true); setNewSlug(e.target.value); }} placeholder="my-article-slug" />
          </label>
          <label className="field-col">
            类型
            <select value={newType} onChange={(e) => setNewType(e.target.value)}>
              {DEFAULT_CONTENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          {createError ? <p className="error-text" role="alert">{createError}</p> : null}
          <div className="action-row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setCreateOpen(false)}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>{saveMutation.isPending ? "创建中…" : "开始写作"}</button>
          </div>
        </form>
      </ModalDialog>
    </>
  );
}
