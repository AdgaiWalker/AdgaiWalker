import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import { buildXShareIntentUrl } from "@walker/shared";
import { requestJson } from "../../api/http";
import {
  useAllContentSocialStats,
  useContent,
  useContentSyncPull,
  useContentSyncStatus,
  useDeleteContent,
  useSaveContent,
} from "../../api/queries";
import { ContentTable } from "../../components/ContentTable";
import { GitSyncBadge } from "../../components/GitSyncBadge";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeading,
} from "../../components/States";
import {
  CustomContentType,
  DEFAULT_CONTENT_TYPES,
  getCustomContentTypes,
  saveCustomContentType,
} from "../../shared/content-types";
import { timeLabel, typeLabel } from "../../shared/labels";
import { ADMIN_ROUTES as R } from "../../shared/routes";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function autoSlug(text: string): string {
  const dateMatch = text.match(/\b(20\d{2})[-_./]?(\d{1,2})[-_./]?(\d{1,2})\b/);
  const datePart = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`
    : "";

  const latin = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-");

  if (SLUG_RE.test(latin)) return latin;
  if (datePart) return `${datePart}-daily`;
  const today = new Date().toISOString().slice(0, 10);
  return `diary-${today}`;
}

export function ContentListPage() {
  const query = useContent();
  const socialStatsQuery = useAllContentSocialStats();
  const syncStatusQuery = useContentSyncStatus();
  const syncPullMutation = useContentSyncPull();
  const saveMutation = useSaveContent();
  const deleteMutation = useDeleteContent();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ slug: string; title: string } | null>(null);
  const type = params.get("type") ?? "";
  const stage = params.get("stage") ?? "";
  const website = params.get("website") ?? "";
  const social = params.get("social") ?? "";
  const indexState = params.get("index") ?? (params.get("version") === "index-behind" ? "behind" : "");
  const versionFilter = params.get("version") ?? "";

  const handleShareToX = (slug: string, title: string) => {
    const url = buildXShareIntentUrl({
      title,
      slug,
    });
    window.open(url, "_blank", "noopener,noreferrer");

    // 静默登记宣发流水并无感刷新计数
    requestJson(`/admin/content/${encodeURIComponent(slug)}/social-shares`, {
      method: "POST",
      body: { channel: "x", angle: "overview" },
    })
      .then(() => {
        void socialStatsQuery.refetch();
      })
      .catch(() => {
        // fail-open 不影响正常发推体验
      });
  };

  // 新建模态框状态（极简开写：不要求动笔前填摘要）
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newType, setNewType] = useState("knowledge");
  const [isPublished, setIsPublished] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);

  // 自定义内容类型管理
  const [customTypes, setCustomTypes] = useState<CustomContentType[]>(() => getCustomContentTypes());
  const [isAddingType, setIsAddingType] = useState(false);
  const [newCustomTypeValue, setNewCustomTypeValue] = useState("");
  const [newCustomTypeLabel, setNewCustomTypeLabel] = useState("");
  const [customTypeError, setCustomTypeError] = useState<string | null>(null);

  const handleOpenCreateModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    const defaultTitle = `${today} 站主日记`;
    setNewTitle(defaultTitle);
    setNewSlug(autoSlug(defaultTitle));
    setNewType("knowledge");
    setIsPublished(true);
    setCreateError(null);
    setIsAddingType(false);
    setNewCustomTypeValue("");
    setNewCustomTypeLabel("");
    setCustomTypeError(null);
    setCustomTypes(getCustomContentTypes());
    setShowCreateModal(true);
  };

  const handleConfirmAddCustomType = () => {
    setCustomTypeError(null);
    const val = newCustomTypeValue.trim().toLowerCase();
    if (!val) {
      setCustomTypeError("请输入类型英文标识");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(val)) {
      setCustomTypeError("类型标识仅限小写英文、数字与短横线，例如 essay、review");
      return;
    }
    const label = newCustomTypeLabel.trim() || val;
    const updated = saveCustomContentType({ value: val, label });
    setCustomTypes(updated);
    setNewType(val);
    setNewCustomTypeValue("");
    setNewCustomTypeLabel("");
    setIsAddingType(false);
  };

  const handleTitleChange = (val: string) => {
    setNewTitle(val);
    setNewSlug(autoSlug(val));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    const title = newTitle.trim();
    const slug = newSlug.trim().toLowerCase();

    if (!title) {
      setCreateError("请输入标题");
      return;
    }
    if (!SLUG_RE.test(slug)) {
      setCreateError("标识（Slug）须为小写英文字母、数字与短横线，例如：2026-10-29-daily");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const matchedCustom = customTypes.find((c) => c.value === newType);
    const defaultTag = newType === "knowledge" ? "日记, 随笔" : (matchedCustom?.label || newType);
    const raw = [
      "---",
      `title: "${title.replace(/"/g, '\\"')}"`,
      `date: ${today}`,
      `updated: ${today}`,
      `tags: [${defaultTag}]`,
      `type: ${newType}`,
      `form: note`,
      `domain: life`,
      `intent: record`,
      `valueMode: existence`,
      `published: ${isPublished}`,
      `summary: "待写完后提炼"`,
      `author: "duola"`,
      `aiUsePolicy:`,
      `  level: AI-2`,
      `  readable: true`,
      `  citable: true`,
      `  actionable: false`,
      "---",
      "",
      `# ${title}`,
      "",
      "在此开始记录...",
      "",
    ].join("\n");

    try {
      await saveMutation.mutateAsync({
        slug,
        raw,
        expectedHash: null,
      });
      setShowCreateModal(false);
      void query.refetch();
      navigate(R.contentDetail(slug));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "创建失败，请重试";
      if (msg.includes("conflict") || msg.includes("已存在")) {
        setCreateError(`标识「${slug}」已存在，请换一个标识`);
      } else {
        setCreateError(msg);
      }
    }
  };

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  const data = query.data;
  const all = data?.data ?? [];
  const socialStats = socialStatsQuery.data;
  const items = all.filter(
    (item) => {
      const stats = socialStats?.[item.slug];
      const hasShared = Boolean(stats && stats.shareCount > 0);
      if (social === "unshared" && hasShared) return false;
      if (social === "shared" && !hasShared) return false;

      return (
        (!type || item.type === type) &&
        (!stage || item.stage === stage) &&
        (!website || (website === "unknown" ? data?.publicationAvailable === false :
          data?.publicationAvailable === true && (website === "verified") === Boolean(item.publication.publishedHash))) &&
        (!indexState || (indexState === "behind" && Boolean(item.publication.publishedHash) &&
          Boolean(item.publication.indexedHash) && item.publication.indexedHash !== item.publication.publishedHash)) &&
        (versionFilter !== "working-ahead" || Boolean(item.publication.publishedHash && item.publication.currentPublicHash &&
          item.publication.currentPublicHash !== item.publication.publishedHash)) &&
        `${item.title} ${item.slug}`.toLowerCase().includes(search.toLowerCase())
      );
    },
  );
  return (
    <>
      <PageHeading
        title="内容"
        description="浏览文章、项目与想法，了解内容的当前状态。"
        action={
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <GitSyncBadge />
            <button className="primary" onClick={handleOpenCreateModal}>
              <Plus size={16} />
              新建文章 / 日记
            </button>
            <button onClick={() => void query.refetch()}>
              <RefreshCw size={16} />
              刷新数据
            </button>
          </div>
        }
      />
      {Boolean(syncStatusQuery.data?.behind && syncStatusQuery.data.behind > 0) && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "8px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: "#92400e", fontSize: "14px" }}>
              💡 检测到远端 GitHub 有新内容（落后 {syncStatusQuery.data?.behind} 个提交）
            </div>
            <div style={{ fontSize: "13px", color: "#b45309", marginTop: "2px" }}>
              {syncStatusQuery.data?.incomingFiles.length
                ? `待拉取文章：${syncStatusQuery.data.incomingFiles.slice(0, 4).join("、")}${syncStatusQuery.data.incomingFiles.length > 4 ? " 等" : ""}`
                : "包含内容更新，点击右侧按钮立即同步到当前网页工作台"}
            </div>
          </div>
          <button
            className="primary"
            style={{ background: "#d97706", borderColor: "#b45309", whiteSpace: "nowrap" }}
            disabled={syncPullMutation.isPending}
            onClick={async () => {
              await syncPullMutation.mutateAsync();
              await Promise.all([
                syncStatusQuery.refetch(),
                query.refetch(),
                socialStatsQuery.refetch(),
              ]);
            }}
          >
            {syncPullMutation.isPending ? "正在拉取同步..." : "立即从 GitHub 同步"}
          </button>
        </div>
      )}
      <div className="notice">
        列表用于查看状态；打开条目可编辑。工作区、网页和问答索引分别显示，不以 Git 状态推断已上线。
      </div>
      <section className="panel">
        <div className="toolbar">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="搜索内容"
              placeholder="搜索标题或标识"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="内容类型"
            value={type}
            onChange={(e) => updateParam("type", e.target.value)}
          >
            <option value="">全部类型</option>
            <option value="knowledge">文章 (knowledge)</option>
            <option value="learn">学习笔记 (learn)</option>
            <option value="project">项目 (project)</option>
            <option value="tool">工具 (tool)</option>
            <option value="idea">想法 (idea)</option>
            <option value="shop">小店 (shop)</option>
            {[...new Set([...all.map((item) => item.type), ...customTypes.map((c) => c.value)])]
              .filter((t) => !["knowledge", "learn", "project", "tool", "idea", "shop"].includes(t))
              .map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)} ({t})
                </option>
              ))}
          </select>
          <select
            aria-label="内容阶段"
            value={stage}
            onChange={(e) => updateParam("stage", e.target.value)}
          >
            <option value="">全部阶段</option>
            <option value="draft">草稿 (draft)</option>
            <option value="review">待审 (review)</option>
            <option value="ready">工作区有改动 (ready)</option>
            <option value="live">Git 已同步 (live)</option>
          </select>
          <select aria-label="网页状态" value={website} onChange={(e) => updateParam("website", e.target.value)}>
            <option value="">全部网页状态</option>
            <option value="verified">已确证</option>
            <option value="unverified">未核验</option>
            <option value="unknown">状态待核对</option>
          </select>
          <select aria-label="宣发状态" value={social} onChange={(e) => updateParam("social", e.target.value)}>
            <option value="">全部宣发状态</option>
            <option value="unshared">未在社媒宣发</option>
            <option value="shared">已发 X (Twitter)</option>
          </select>
        </div>

        {type === "project" && (
          <div className="notice" style={{ margin: "0 22px 14px", background: "#f8fafc" }}>
            <strong>项目内容管理</strong>：使用现有内容模型受控管理。项目状态与进度受管理鉴权、CAS 和对象锁保护，前台访客及 AI 无法修改项目状态。
          </div>
        )}

        {type === "shop" && (
          <div className="notice" style={{ margin: "0 22px 14px", background: "#fffbeb", color: "#92400e", border: "1px solid #fef3c7" }}>
            <strong>小店内容边界</strong>：小店交易与订单履约系统尚未接入，当前仅作为商品与服务介绍内容展示入口。不建立订单或库存数据模型，不提供可执行交易操作。
          </div>
        )}
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : items.length ? (
          <ContentTable
            items={items}
            gitAvailable={data?.gitAvailable === true}
            publicationAvailable={data?.publicationAvailable === true}
            socialStats={socialStats}
            onShareToX={handleShareToX}
            onDelete={(slug, title) => setDeleteTarget({ slug, title })}
          />
        ) : (
          <EmptyState
            title={type === "shop" ? "小店暂无商品或服务介绍" : all.length ? "没有匹配的内容" : "内容目录暂无条目"}
          >
            {type === "shop"
              ? "小店交易系统尚未接入。当前仅支持展示商品与服务介绍内容；不建立订单/库存数据模型，不提供在线交易功能。"
              : "可调整筛选条件，或在内容目录准备文章后重新读取。"}
          </EmptyState>
        )}
        {data && !query.isError && (
          <p className="source">
            显示 {items.length} / {all.length} 项 · 内容文件与 Git · 读取于{" "}
            {timeLabel(data.generatedAt as string)}
          </p>
        )}
      </section>

      {showCreateModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-content-modal-title"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="modal-card"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <h3 id="create-content-modal-title" style={{ margin: 0 }}>
                新建文章 / 日记
              </h3>
              <button
                type="button"
                className="button"
                style={{ padding: "4px 8px", border: "none", boxShadow: "none" }}
                onClick={() => setShowCreateModal(false)}
                aria-label="关闭"
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--muted)" }}>
              创建后直接进入在线编辑器书写；写完保存后可进入发布流程推送到 GitHub 上线。
            </p>

            {createError && (
              <div
                className="notice"
                style={{
                  background: "#fef2f2",
                  color: "#991b1b",
                  border: "1px solid #fecaca",
                  marginBottom: 14,
                }}
              >
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                  文章 / 日记标题 *
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="例如：2026-10-29 站主日记"
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                  文件名标识（Slug）*
                  <input
                    type="text"
                    required
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    placeholder="例如：2026-10-29-daily"
                  />
                  <small style={{ color: "var(--muted)", fontWeight: "normal" }}>
                    用于生成文件名与网页 URL（仅限小写英文、数字与短横线 -）
                  </small>
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label htmlFor="create-content-type" style={{ fontSize: 13, fontWeight: 500 }}>
                        内容类型
                      </label>
                      <button
                        type="button"
                        aria-label="添加新类型"
                        onClick={() => setIsAddingType((prev) => !prev)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "2px 6px",
                          fontSize: 12,
                          background: isAddingType ? "var(--bg-subtle, #f1f5f9)" : "transparent",
                          border: "1px dashed var(--border)",
                          borderRadius: 4,
                          color: "var(--primary)",
                          cursor: "pointer",
                        }}
                        title="添加自定义内容类型"
                      >
                        <Plus size={13} />
                        {isAddingType ? "收起" : "添加类型"}
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <select
                        id="create-content-type"
                        aria-label="新建内容类型"
                        style={{ flex: 1 }}
                        value={newType}
                        onChange={(e) => {
                          if (e.target.value === "__add_new__") {
                            setIsAddingType(true);
                          } else {
                            setNewType(e.target.value);
                          }
                        }}
                      >
                        <option value="knowledge">知识文章 / 日记 (knowledge)</option>
                        <option value="learn">学习笔记 (learn)</option>
                        <option value="idea">灵感想法 (idea)</option>
                        <option value="project">项目 (project)</option>
                        <option value="tool">工具 (tool)</option>
                        {customTypes.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label} ({t.value})
                          </option>
                        ))}
                        <option value="__add_new__">➕ 添加新内容类型...</option>
                      </select>
                      <button
                        type="button"
                        aria-label="添加新内容类型按钮"
                        onClick={() => setIsAddingType((prev) => !prev)}
                        className="button"
                        style={{
                          padding: "0 10px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 38,
                        }}
                        title="添加新内容类型"
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    {isAddingType && (
                      <div
                        style={{
                          marginTop: 6,
                          padding: "10px",
                          background: "#f8fafc",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                          添加自定义内容类型
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            type="text"
                            aria-label="新类型标识"
                            value={newCustomTypeValue}
                            onChange={(e) => setNewCustomTypeValue(e.target.value.toLowerCase().trim())}
                            placeholder="英文标识，如 essay"
                            style={{ flex: 1, fontSize: 12, padding: "4px 8px", height: 30 }}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleConfirmAddCustomType();
                              }
                            }}
                          />
                          <input
                            type="text"
                            aria-label="新类型名称"
                            value={newCustomTypeLabel}
                            onChange={(e) => setNewCustomTypeLabel(e.target.value)}
                            placeholder="显示名称，如 思考随笔"
                            style={{ flex: 1, fontSize: 12, padding: "4px 8px", height: 30 }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleConfirmAddCustomType();
                              }
                            }}
                          />
                        </div>
                        {customTypeError && (
                          <div style={{ fontSize: 12, color: "var(--danger, #dc2626)" }}>
                            {customTypeError}
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                          <button
                            type="button"
                            className="button"
                            style={{ padding: "2px 8px", fontSize: 12, height: 26 }}
                            onClick={() => {
                              setIsAddingType(false);
                              setCustomTypeError(null);
                            }}
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            className="button primary"
                            style={{ padding: "2px 10px", fontSize: 12, height: 26 }}
                            onClick={handleConfirmAddCustomType}
                          >
                            确定添加
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 24, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={isPublished}
                      onChange={(e) => setIsPublished(e.target.checked)}
                      style={{ width: 16, height: 16 }}
                    />
                    <span>公开发布（未勾选则存为草稿）</span>
                  </label>
                </div>
              </div>

              <div className="modal-card-actions" style={{ marginTop: 22 }}>
                <button
                  type="button"
                  className="button"
                  onClick={() => setShowCreateModal(false)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? "正在创建..." : "创建并开写"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="modal-card"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-modal-title" style={{ color: "#991b1b" }}>
              确认删除文章/草稿？
            </h3>
            <p style={{ margin: "12px 0 18px", fontSize: 14, color: "#334155", lineHeight: 1.6 }}>
              即将删除《<strong>{deleteTarget.title}</strong>》（<code>{deleteTarget.slug}</code>）。此操作将永久移除该文章源文件，不可恢复。
            </p>
            <div className="modal-card-actions">
              <button
                type="button"
                className="button"
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteTarget(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="button primary"
                style={{ background: "#dc2626", borderColor: "#dc2626" }}
                disabled={deleteMutation.isPending}
                onClick={async () => {
                  try {
                    await deleteMutation.mutateAsync({ slug: deleteTarget.slug });
                    setDeleteTarget(null);
                    query.refetch();
                  } catch (err: unknown) {
                    alert(err instanceof Error ? err.message : "删除失败");
                  }
                }}
              >
                {deleteMutation.isPending ? "正在删除..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
