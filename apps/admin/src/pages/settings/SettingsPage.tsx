import { useCapabilities } from "../../app/AdminShell";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeading,
} from "../../components/States";
import { capabilityLabels, timeLabel } from "../../shared/labels";
export function SettingsPage() {
  const query = useCapabilities();
  return (
    <>
      <PageHeading title="设置" description="查看当前可用能力与连接状态。" />
      <section className="panel">
        <h2>授权</h2>
        <p>授权在 Agent 详情里管理。新授权默认一次，修改和发布分开。持续内容全权入口已禁用。前台没有临时提权入口。</p>
      </section>
      <section className="panel">
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : (
          query.data && (
            <>
              <div className="detail-fields">
                <p>数据库：SQLite · 检查于 {timeLabel(query.data.checkedAt)}</p>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>能力</th>
                      <th>状态</th>
                      <th>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.items.map((item) => (
                      <tr key={item.key}>
                        <td>{capabilityLabels[item.key]}</td>
                        <td>
                          <span
                            className={`badge ${item.state === "available" ? "green" : ""}`}
                          >
                            {
                              {
                                available: "可用",
                                unavailable: "暂不可用",
                                "not-connected": "未接入",
                              }[item.state]
                            }
                          </span>
                        </td>
                        <td>{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </section>
      <EmptyState title="配置编辑尚未接入">
        模型连接、权限上限与日志保留将在对应阶段开放。当前没有可修改的开关。
      </EmptyState>
    </>
  );
}
