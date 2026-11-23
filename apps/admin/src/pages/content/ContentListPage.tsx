import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CloudUpload, Plus, RefreshCw, Search } from "lucide-react";
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

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function autoSlug(text: string): string {
  const dateMatch = text.match(/\b(20\d{2})[-_./]?(\d{1,2})[-_./]?(\d{1,2})\b/);
  const latin = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-");
  if (SLUG_RE.test(latin)) return latin;
  if (dateMatch) return `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}-note`;
  return `post-${new Date().toISOString().slice(0, 10)}`;
}

type FilterMode = "all" | "draft" | "live";

export function ContentListPage() {
  const query = useContent();
  const syncQuery = useContentSyncStatus();
  const pullMutation = useContentSyncPull();
  const backupMutation = useContentDraftBackup();
  const saveMutation = useSaveContent();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [newType, setNewType] = useState("knowledge");
  const [createError, setCreateError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const filter: FilterMode =
    params.get("filter") === "draft" || params.get("filter") === "live"
      ? (params.get("filter") as FilterMode)
      : "all";

  const setFilter = (next: FilterMode) => {
    const p = new URLSearchParams(params);
    if (next === "all") p.delete("filter");
    else p.set("filter", next);
    setParams(p, { replace: true });
  };

  const items = query.data?.data ?? [];
  const dirtyCount = syncQuery.data?.dirtyFiles.length ?? 0;
  const behindCount = syncQuery.data?.behind ?? 0;
  const conflictCount = syncQuery.data?.conflicts?.length ?? 0;

  const isVerifiedLive = (item: (typeof items)[number]) =>
    Boolean(item.publication.publishedHash && item.publication.publishedHash === item.publication.currentPublicHash);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const isLive = isVerifiedLive(item);
      if (filter === "live" && !isLive) return false;
      if (filter === "draft" && isLive) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || item.slug.toLowerCase().includes(q);
    });
  }, [items, filter, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    const slug = (newSlug.trim() || autoSlug(title)).toLowerCase();
    if (!title) {
      setCreateError("请填写标题");
      return;
    }
    if (!SLUG_RE.test(slug)) {
      setCreateError("Slug 仅支持小写字母、数字和连字符");
      return;
    }
    setCreateError(null);
    const today = new Date().toISOString().slice(0, 10);
    const raw = [
      "---",
      `title: "${title.replace(/"/g, '\\"')}"`,
      `type: ${newType}`,
      "form: note",
      "domain: thinking",
      "intent: clarify",
      "valueMode: insight",
      `updated: ${today}`,
      `summary: "${title.replace(/"/g, '\\"')}"`,
      "visibility: public",
      "published: false",
      "aiUsePolicy:",
      "  readable: true",
      "  citable: true",
      "---",
      "",
      `# ${title}`,
      "",
    ].join("\n");

    try {
      await saveMutation.mutateAsync({ slug, raw, expectedHash: null });
      setCreateOpen(false);
      setNewTitle("");
      setNewSlug("");
      setSlugTouched(false);
      navigate(R.contentDetail(slug));
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "创建失败");
    }
  };

  const handleBackupDrafts = async () => {
    setSyncNotice(null);
    try {
      const res = await backupMutation.mutateAsync();
      setSyncNotice(res.message);
      void syncQuery.refetch();
    } catch (err) {
      setSyncNotice(err instanceof Error ? err.message : "草稿备份失败");
    }
  };

  const handlePull = async () => {
    setSyncNotice(null);
    try {
      const res = await pullMutation.mutateAsync();
      setSyncNotice(res.message);
      void query.refetch();
      void syncQuery.refetch();
    } catch (err) {
      setSyncNotice(err instanceof Error ? err.message : "同步失败");
    }
  };

  return (
    <>
      <div className="list-toolbar">
        <div className="search-box">
          <Search size={15} className="muted" aria-hidden="true" />
          <input
            type="search"
            aria-label="搜索文章"
            placeholder="搜索标题或 slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="chip-row" role="group" aria-label="按状态筛选">
          {(
            [
              ["all", "全部"],
              ["draft", "未上线"],
              ["live", "已上线"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`chip ${filter === key ? "is-active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <Plus size={15} aria-hidden="true" />
          新建文章
        </button>
      </div>

      {/* 按需显现：只有存在草稿、落后远端、冲突或操作回执时才占用一行 */}
      {dirtyCount > 0 || behindCount > 0 || conflictCount > 0 || syncNotice ? (
        <div className="release-strip warn">
          <span>
            {syncNotice ??
              (conflictCount > 0
                ? `检测到 ${conflictCount} 篇同篇冲突，请打开对应文章核对`
                : behindCount > 0
                  ? `GitHub 有 ${behindCount} 个新提交待拉取`
                  : `当前有 ${dirtyCount} 篇本地草稿未上线`)}
          </span>
          <div className="action-row">
            {behindCount > 0 ? (
              <button
                type="button"
                className="btn"
                disabled={pullMutation.isPending}
                onClick={() => void handlePull()}
              >
                <RefreshCw size={13} aria-hidden="true" />
                {pullMutation.isPending ? "拉取中…" : "拉取最新"}
              </button>
            ) : null}
            {dirtyCount > 0 ? (
              <button
                type="button"
                className="btn"
                disabled={backupMutation.isPending}
                onClick={() => void handleBackupDrafts()}
              >
                <CloudUpload size={13} aria-hidden="true" />
                {backupMutation.isPending ? "备份中…" : `备份草稿 (${dirtyCount})`}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : filtered.length === 0 ? (
        <EmptyState title={items.length === 0 ? "还没有文章" : "没有匹配的文章"}>
          {items.length === 0 ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              新建第一篇文章
            </button>
          ) : null}
        </EmptyState>
      ) : (
        <div className="article-list">
          {filtered.map((item) => {
            const isLive = isVerifiedLive(item);
            const statusText = isLive ? "已上线" : "草稿";
            return (
              <Link key={item.slug} to={R.contentDetail(item.slug)} className="article-row">
                <div className="article-row-main">
                  <span className="article-row-title">{item.title}</span>
                  <span className="article-row-meta">
                    <span className="mono">{item.slug}</span>
                    <span>·</span>
                    <span>{timeLabel(item.updatedAt)}</span>
                  </span>
                </div>
                <span className={`badge ${isLive ? "green" : "amber"}`}>
                  <span className={`status-dot ${isLive ? "live" : "draft"}`} aria-hidden="true" />
                  {statusText}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <ModalDialog open={createOpen} title="新建文章" onClose={() => setCreateOpen(false)}>
        <form onSubmit={(e) => void handleCreate(e)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            标题
            <input
              type="text"
              autoFocus
              required
              placeholder="输入文章标题"
              value={newTitle}
              onChange={(e) => {
                setNewTitle(e.target.value);
                if (!slugTouched) setNewSlug(autoSlug(e.target.value));
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            路径标识 (slug)
            <input
              type="text"
              required
              className="mono"
              value={newSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setNewSlug(e.target.value);
              }}
              placeholder="my-article-slug"
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            类型
            <select value={newType} onChange={(e) => setNewType(e.target.value)}>
              {DEFAULT_CONTENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {createError ? (
            <p className="error-text" role="alert">
              {createError}
            </p>
          ) : null}
          <div className="action-row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setCreateOpen(false)}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "创建中…" : "开始写作"}
            </button>
          </div>
        </form>
      </ModalDialog>
    </>
  );
}
