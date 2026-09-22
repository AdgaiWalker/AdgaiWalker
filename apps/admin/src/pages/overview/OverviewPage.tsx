import { Link } from "react-router-dom";
import { Bot, FileText, Clock, ArrowRight, RefreshCw } from "lucide-react";
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
import { RunTable } from "../../components/RunTable";
import { ADMIN_ROUTES as R } from "../../shared/routes";
import { timeLabel } from "../../shared/labels";
export function OverviewPage() {
  const content = useContent(),
    agents = useAgents(),
    runs = useExecutionRuns("", "", 5),
    capabilities = useCapabilities();
  const metrics = [
    { label: "已有内容", query: content, icon: FileText, path: R.content },
    { label: "已有 Agent", query: agents, icon: Bot, path: R.agents },
    { label: "历史运行", query: runs, icon: Clock, path: R.records },
  ];
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
              ])
            }
          >
            <RefreshCw size={16} />
            刷新数据
          </button>
        }
      />
      <section className="metrics" aria-label="当前资产">
        {metrics.map(({ label, query, icon: Icon, path }) => (
          <Link to={path} key={label} className="metric">
            <Icon size={32} />
            <span>
              {label}
              <strong>
                {query.isError ? "不可用" : "total" in (query.data ?? {}) ? (query.data as { total: number }).total : "—"}
              </strong>
            </span>
          </Link>
        ))}
      </section>
      <div className="overview-grid">
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
        <Panel title="接下来" className="next-panel">
          <p>先整理内容，再逐步接通 Agent。</p>
          <div className="quick-links">
            <Link to={R.content}>
              <FileText size={20} />
              浏览内容
              <ArrowRight size={18} />
            </Link>
            <Link to={R.agents}>
              <Bot size={20} />
              查看 Agent
              <ArrowRight size={18} />
            </Link>
          </div>
        </Panel>
      </div>
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
