import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useAgents, useContent, useExecutionRuns } from "../../api/queries";
import { useCapabilities } from "../../app/AdminShell";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeading,
  Panel,
} from "../../components/States";
import { ContentTable } from "../../components/ContentTable";
import { ReminderInboxPanel } from "../../components/ReminderInboxPanel";
import { OpsStatsPanel } from "./OpsStatsPanel";
import { RuntimeMonitorPanel } from "../records/RuntimeMonitorPanel";
import { RunTable } from "../../components/RunTable";
import { ADMIN_ROUTES as R } from "../../shared/routes";
import { timeLabel } from "../../shared/labels";
export function OverviewPage() {
  const queryClient = useQueryClient();
  const content = useContent(),
    agents = useAgents(),
    runs = useExecutionRuns("", "", 5),
    capabilities = useCapabilities();
  return (
    <>
      <PageHeading
        title="概览"
        description="看看内容与 Agent 的近况。"
        action={
          <button
            onClick={() =>
              void Promise.all([
                content.refetch(),
                agents.refetch(),
                runs.refetch(),
                capabilities.refetch(),
                queryClient.invalidateQueries({ queryKey: ["ops-overview"] }),
                queryClient.invalidateQueries({ queryKey: ["reminder-inbox"] }),
              ])
            }
          >
            <RefreshCw size={16} />
            刷新数据
          </button>
        }
      />
      {/* O07：关键数据取代框架阶段的基础汇总；每个数字都可下钻到同筛选明细 */}
      <OpsStatsPanel />
      {/*
        运行监控（2026-10-12 从「运营记录」搬来）：本地开发用的进程内诊断，
        与"业务发生过什么"的运营时间线不是一类，所以放概览底部、默认收起。
        <details> 展开才挂载面板 —— 不展开就不发那三个轮询请求。
      */}
      <details style={{ padding: "0 22px 10px" }}>
        <summary className="muted">运行监控（进程内 · 重启清零 · 开发诊断用）</summary>
        <div style={{ marginTop: 12 }}>
          <RuntimeMonitorPanel />
        </div>
      </details>
      <Panel
          title="内容一览"
          action={
            <Link to={R.content}>
              查看全部 <ArrowRight size={16} />
            </Link>
          }
        >
          {content.isPending ? (
            <LoadingState />
          ) : content.isError ? (
            <ErrorState error={content.error} retry={content.refetch} />
          ) : content.data?.data.length ? (
            <ContentTable items={content.data.data.slice(0, 4)} compact />
          ) : (
            <EmptyState title="内容目录暂无条目">
              准备内容后，在这里查看。
            </EmptyState>
          )}
      </Panel>
      <ReminderInboxPanel />
      <Panel
        title="最近运行"
        action={
          <Link to={R.records}>
            查看全部 <ArrowRight size={16} />
          </Link>
        }
      >
        {runs.isPending ? (
          <LoadingState />
        ) : runs.isError ? (
          <ErrorState error={runs.error} retry={runs.refetch} />
        ) : runs.data?.items.length ? (
          <RunTable items={runs.data.items} />
        ) : (
          <EmptyState title="暂无运行记录">
            接通 Agent 后，在这里查看每次执行的结果。
          </EmptyState>
        )}
      </Panel>
      <p className="source">
        内容文件与现有数据库 · 内容读取于{" "}
        {timeLabel(content.data?.generatedAt as string)} · Agent 读取于{" "}
        {timeLabel(
          agents.dataUpdatedAt
            ? new Date(agents.dataUpdatedAt).toISOString()
            : undefined,
        )}{" "}
        · 运行读取于{" "}
        {timeLabel(
          runs.dataUpdatedAt
            ? new Date(runs.dataUpdatedAt).toISOString()
            : undefined,
        )}
      </p>
    </>
  );
}
