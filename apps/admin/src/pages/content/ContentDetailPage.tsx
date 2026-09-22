import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useContentDetail } from "../../api/queries";
import { ErrorState, LoadingState, PageHeading } from "../../components/States";
import { MarkdownPreview } from "../../components/MarkdownPreview";
import { ADMIN_ROUTES as R } from "../../shared/routes";
import { timeLabel, typeLabel } from "../../shared/labels";
export function ContentDetailPage() {
  const { slug = "" } = useParams(),
    query = useContentDetail(slug),
    [raw, setRaw] = useState(false);
  const item = query.data?.data;
  return (
    <>
      <Link className="back-link" to={R.content}>
        返回内容列表
      </Link>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : (
        item && (
          <>
            <PageHeading
              title={item.title}
              description={`${typeLabel(item.type)} · 更新于 ${timeLabel(item.updatedAt)}`}
            />
            <div className="notice">
              内容正本 · 只读。保存、发布与线上版本核验将在后续接通。
            </div>
            <section className="panel">
              <div className="tabs" aria-label="内容展示">
                <button aria-pressed={!raw} onClick={() => setRaw(false)}>
                  预览
                </button>
                <button aria-pressed={raw} onClick={() => setRaw(true)}>
                  原文与元数据
                </button>
              </div>
              {raw ? (
                <pre className="raw-content">{item.raw}</pre>
              ) : (
                <MarkdownPreview raw={item.raw} />
              )}
            </section>
          </>
        )
      )}
    </>
  );
}
