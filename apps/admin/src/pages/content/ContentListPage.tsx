import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw, Search } from "lucide-react";
import { useContent } from "../../api/queries";
import { ContentTable } from "../../components/ContentTable";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeading,
} from "../../components/States";
import { timeLabel, typeLabel } from "../../shared/labels";
export function ContentListPage() {
  const query = useContent();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const type = params.get("type") ?? "";
  const stage = params.get("stage") ?? "";
  const website = params.get("website") ?? "";
  const indexState = params.get("index") ?? (params.get("version") === "index-behind" ? "behind" : "");
  const versionFilter = params.get("version") ?? "";

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
          <button onClick={() => void query.refetch()}>
            <RefreshCw size={16} />
            刷新数据
          </button>
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
    </>
  );
}
