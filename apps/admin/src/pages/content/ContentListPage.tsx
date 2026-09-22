import { useState } from "react";
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
  const query = useContent(),
    [search, setSearch] = useState(""),
    [type, setType] = useState("");
  const data = query.data,
    all = data?.data ?? [];
  const items = all.filter(
    (item) =>
      (!type || item.type === type) &&
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
        当前为只读浏览。历史状态来自文件与 Git，网页和问答版本尚未核验。
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
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">全部类型</option>
            {[...new Set(all.map((item) => item.type))].map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </div>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : items.length ? (
          <ContentTable
            items={items}
            gitAvailable={data?.gitAvailable === true}
          />
        ) : (
          <EmptyState
            title={all.length ? "没有匹配的内容" : "内容目录暂无条目"}
          >
            可调整筛选条件，或在内容目录准备文章后重新读取。
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
