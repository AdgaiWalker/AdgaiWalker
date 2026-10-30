import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import { useContent, useSaveContent } from "../../api/queries";
import { ContentTable } from "../../components/ContentTable";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeading,
} from "../../components/States";
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
  const saveMutation = useSaveContent();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const type = params.get("type") ?? "";
  const stage = params.get("stage") ?? "";
  const website = params.get("website") ?? "";
  const indexState = params.get("index") ?? (params.get("version") === "index-behind" ? "behind" : "");
  const versionFilter = params.get("version") ?? "";

  // 新建模态框状态（极简开写：不要求动笔前填摘要）
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newType, setNewType] = useState("knowledge");
  const [isPublished, setIsPublished] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleOpenCreateModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    const defaultTitle = `${today} 站主日记`;
    setNewTitle(defaultTitle);
    setNewSlug(autoSlug(defaultTitle));
    setNewType("knowledge");
    setIsPublished(true);
    setCreateError(null);
    setShowCreateModal(true);
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
    const defaultTag = newType === "knowledge" ? "日记, 随笔" : newType;
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
  const items = all.filter(
    (item) =>
      (!type || item.type === type) &&
      (!stage || item.stage === stage) &&
      (!website || (website === "unknown" ? data?.publicationAvailable === false :
        data?.publicationAvailable === true && (website === "verified") === Boolean(item.publication.publishedHash))) &&
      (!indexState || (indexState === "behind" && Boolean(item.publication.publishedHash) &&
        Boolean(item.publication.indexedHash) && item.publication.indexedHash !== item.publication.publishedHash)) &&
      (versionFilter !== "working-ahead" || Boolean(item.publication.publishedHash && item.publication.currentPublicHash &&
        item.publication.currentPublicHash !== item.publication.publishedHash)) &&
      `${item.title} ${item.slug}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        title="内容"
        description="浏览文章、项目与想法，了解内容的当前状态。"
        action={
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
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
            {[...new Set(all.map((item) => item.type))]
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
                  <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                    内容类型
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value)}
                    >
                      <option value="knowledge">知识文章 / 日记 (knowledge)</option>
                      <option value="learn">学习笔记 (learn)</option>
                      <option value="idea">灵感想法 (idea)</option>
                      <option value="project">项目 (project)</option>
                    </select>
                  </label>

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
    </>
  );
}
