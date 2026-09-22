import { Link } from "react-router-dom";
import type { ExecutionRunListItem } from "@walker/shared";
import { ADMIN_ROUTES as R } from "../shared/routes";
import { statusLabel, timeLabel } from "../shared/labels";

function usage(row: ExecutionRunListItem) {
  if (row.tokensIn === null || row.tokensOut === null) return "未知";
  return String(row.tokensIn + row.tokensOut);
}

export function RunTable({ items }: { items: ExecutionRunListItem[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>结果</th>
            <th>耗时</th>
            <th>Token 用量</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>
                <Link to={R.runDetail(row.id)}>{row.agentName ?? "未知"}</Link>
                <small>{row.agentRevisionId ?? "修订未知"}</small>
              </td>
              <td><span className="badge">{statusLabel(row.state)}</span></td>
              <td>{row.elapsedMs === null ? "未知" : row.elapsedMs + " 毫秒"}</td>
              <td>{usage(row)}</td>
              <td>{timeLabel(row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
