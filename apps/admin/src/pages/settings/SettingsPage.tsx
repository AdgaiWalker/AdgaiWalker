import { useCapabilities } from "../../app/AdminShell";
import { ErrorState, LoadingState, PageHeading } from "../../components/States";
import { capabilityLabels, timeLabel } from "../../shared/labels";
import { ModelConfigPanel } from "./ModelConfigPanel";
export function SettingsPage() {
  const query = useCapabilities();
  return (
    <>
      <PageHeading title="设置" description="配置模型连接，查看当前可用能力。" />
      <section className="panel">
        <h2>模型连接</h2>
        <p className="muted">
          提供方、API 网址、API Key 与模型都在这里配置；这是「配好供应商 → 建 Agent → 试跑 →
          看记录 → 部署」闭环的第一环。配置写入本系统自己的 Harness 目录，与站主个人环境无关。
        </p>
        <ModelConfigPanel />
      </section>
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
    </>
  );
}
