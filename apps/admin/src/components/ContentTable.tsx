import { Link } from "react-router-dom";
import type { ContentLedgerEntry } from "@walker/shared";
import { ADMIN_ROUTES as R } from "../shared/routes";
import { timeLabel, typeLabel, visibilityLabel } from "../shared/labels";
export function ContentTable({
  items,
  compact = false,
  gitAvailable = false,
  publicationAvailable = false,
}: {
  items: ContentLedgerEntry[];
  compact?: boolean;
  gitAvailable?: boolean;
  publicationAvailable?: boolean;
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
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
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
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
