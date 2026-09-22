import { Link } from "react-router-dom";
import type { ContentLedgerEntry } from "@walker/shared";
import { ADMIN_ROUTES as R } from "../shared/routes";
import { timeLabel, typeLabel, visibilityLabel } from "../shared/labels";
export function ContentTable({
  items,
  compact = false,
  gitAvailable = false,
}: {
  items: ContentLedgerEntry[];
  compact?: boolean;
  gitAvailable?: boolean;
}) {
  const stages = {
    draft: "草稿",
    review: "字段待补齐",
    ready: "待上线",
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
                <th>历史状态</th>
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
                  <td>{gitAvailable ? stages[item.stage] : "未知"}</td>
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
