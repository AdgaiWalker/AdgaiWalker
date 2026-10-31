import { Link } from "react-router-dom";
import type { AllContentSocialStats, ContentLedgerEntry } from "@walker/shared";
import { buildXShareIntentUrl } from "@walker/shared";
import { ADMIN_ROUTES as R } from "../shared/routes";
import { timeLabel, typeLabel, visibilityLabel } from "../shared/labels";

export function ContentTable({
  items,
  compact = false,
  gitAvailable = false,
  publicationAvailable = false,
  socialStats,
  onShareToX,
}: {
  items: ContentLedgerEntry[];
  compact?: boolean;
  gitAvailable?: boolean;
  publicationAvailable?: boolean;
  socialStats?: AllContentSocialStats;
  onShareToX?: (slug: string, title: string) => void;
}) {
  const stages = {
    draft: "草稿",
    review: "字段待补齐",
    ready: "工作区有改动",
    live: "Git 已同步",
  };
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>标题</th>
            <th>类型</th>
            <th>可见性</th>
            {!compact && (
              <>
                <th>工作区</th>
                <th>网页</th>
                <th>问答索引</th>
                <th>更新时间</th>
                <th>社交同步</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const stats = socialStats?.[item.slug];
            const hasShared = Boolean(stats && stats.shareCount > 0);

            return (
              <tr key={item.slug}>
                <td>
                  <Link to={R.contentDetail(item.slug)}>{item.title}</Link>
                  {!compact && <small>{item.slug}</small>}
                </td>
                <td>{typeLabel(item.type)}</td>
                <td>
                  <span
                    className={`badge ${item.visibility === "public" ? "green" : ""}`}
                  >
                    {visibilityLabel(item.visibility)}
                  </span>
                </td>
                {!compact && (
                  <>
                    <td>
                      {gitAvailable ? stages[item.stage] : "未知"}
                      {item.publication.publishedHash && item.publication.currentPublicHash &&
                      item.publication.publishedHash !== item.publication.currentPublicHash
                        ? " · 正本与线上不同" : ""}
                    </td>
                    <td>
                      {!publicationAvailable ? "状态待核对" : item.publication.publishedHash ? "已确证" : "未核验"}
                      {item.publication.latestAttemptStage === "UNKNOWN" ? " · 最近发布结果待核对" : ""}
                    </td>
                    <td>
                      {!publicationAvailable
                        ? "状态待核对"
                        : !item.publication.publishedHash
                          ? item.publication.indexedHash ? "已有索引·网页未核验" : "待核对"
                        : !item.publication.indexedHash
                          ? "待核对"
                          : item.publication.indexedHash === item.publication.publishedHash
                            ? "已同步"
                            : "落后"}
                    </td>
                    <td>{timeLabel(item.updatedAt)}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {hasShared ? (
                          <span
                            className="badge"
                            style={{
                              background: "#e0f2fe",
                              color: "#0369a1",
                              fontSize: 11,
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}
                            title={`已分享 ${stats!.shareCount} 次 · 最近：${timeLabel(stats!.lastSharedAt || "")}`}
                          >
                            已发 X ({stats!.shareCount}次)
                          </span>
                        ) : (
                          <span
                            className="badge"
                            style={{
                              background: "#f1f5f9",
                              color: "#64748b",
                              fontSize: 11,
                              whiteSpace: "nowrap",
                            }}
                          >
                            未宣发
                          </span>
                        )}
                        <button
                          type="button"
                          className="button"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 7px",
                            fontSize: 11,
                            background: hasShared ? "#ffffff" : "#0f1419",
                            color: hasShared ? "#0f1419" : "#ffffff",
                            borderColor: hasShared ? "#cbd5e1" : "#0f1419",
                            fontWeight: 500,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                          onClick={() => {
                            if (onShareToX) {
                              onShareToX(item.slug, item.title);
                            } else {
                              const url = buildXShareIntentUrl({
                                title: item.title,
                                slug: item.slug,
                              });
                              window.open(url, "_blank", "noopener,noreferrer");
                            }
                          }}
                          title={hasShared ? `再次引用宣发「${item.title}」（已发 ${stats!.shareCount} 次）` : `首次宣发「${item.title}」`}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                          </svg>
                          {hasShared ? "+ 再发一次" : "发到 X"}
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
