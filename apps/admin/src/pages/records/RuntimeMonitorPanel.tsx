import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, TriangleAlert } from "lucide-react";
import {
  RUNTIME_REQUEST_OUTCOME_LABELS,
  formatRuntimeDuration,
  formatRuntimeRatio,
  isRuntimeRequestError,
  isRuntimeRequestInterrupted,
  type RuntimeRequestEntry,
} from "@walker/shared";
import { useRuntimeMetrics, useRuntimeRequests } from "../../api/queries";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import {
  RUNTIME_POLL_INTERVAL_MS,
  RUNTIME_STALE_THRESHOLD_MS,
  RuntimeLogStreamPanel,
} from "./RuntimeLogStreamPanel";

/** 明细取最近 200 条，与后端缓冲上限一致：这是"最近发生了什么"，不是全量归档。 */
const REQUEST_LIMIT = 200;

function uptimeLabel(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return seconds + " 秒";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + " 分 " + (seconds % 60) + " 秒";
  const hours = Math.floor(minutes / 60);
  return hours + " 小时 " + (minutes % 60) + " 分";
}

function timeOf(ts: string): string {
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? "--:--:--" : date.toLocaleTimeString("zh-CN", { hour12: false });
}

/** 结果标签只有一份来源（shared），界面不自己拼中文。 */
function outcomeOf(entry: RuntimeRequestEntry): string {
  return RUNTIME_REQUEST_OUTCOME_LABELS[entry.outcome];
}

/** 空结果必须区分「筛完为空」与「本来就没有」，并说清是哪几个筛选造成的。 */
function emptyRequestCopy(
  errorsOnly: boolean,
  humanOnly: boolean,
): { title: string; hint: string } {
  if (!errorsOnly && !humanOnly) {
    return {
      title: "暂无请求记录",
      hint: "有请求打到 API 就会出现在这里（含 4xx / 5xx 与自动轮询）。",
    };
  }
  const filters = [errorsOnly ? "只看报错" : null, humanOnly ? "只看人工操作" : null]
    .filter((item): item is string => item !== null)
    .join(" + ");
  return {
    title: filters + "时没有匹配的请求记录",
    hint: "这里不会用未筛选的记录顶替；关掉筛选可以看到全部请求。",
  };
}

function requestLine(entry: RuntimeRequestEntry): string {
  return [
    timeOf(entry.ts),
    entry.method + " " + entry.route,
    String(entry.status) + " " + outcomeOf(entry),
    formatRuntimeDuration(entry.durationMs),
    entry.requestId ?? "—",
  ].join("  |  ");
}

/**
 * 运行监控：请求指标 + 请求流水 + 运行日志流。
 *
 * 这是本地开发时的"出事第一现场"：哪个接口报错、哪个环节降级、当前在跑什么。
 * 三条边界：
 * - **只读**：这里没有任何操作按钮（除了刷新与筛选），不存在"点一下把生产改坏"的可能。
 * - **不假装有数据**：分母为 0 的比率显示「—」；采集不可用就显示错误；筛选为空就说"没匹配上"。
 * - **轮询不污染审计**：三个 hook 都带 background 标记（见 queries.ts），
 *   否则每 5 秒一条 GET 都会在审计记录里留一行，把真正的人工操作淹掉。
 */
export function RuntimeMonitorPanel() {
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [humanOnly, setHumanOnly] = useState(false);
  const [isVisible, setIsVisible] = useState(
    () => (typeof document === "undefined" ? true : document.visibilityState === "visible"),
  );
  const [lastFetchedAt, setLastFetchedAt] = useState(() => Date.now());
  const [isStale, setIsStale] = useState(false);
  const queryClient = useQueryClient();

  const interval = isVisible ? RUNTIME_POLL_INTERVAL_MS : false;
  const metrics = useRuntimeMetrics({ refetchInterval: interval });
  const requests = useRuntimeRequests({
    limit: REQUEST_LIMIT,
    errorsOnly,
    humanOnly,
    refetchInterval: interval,
  });

  useEffect(() => {
    const onChange = () => setIsVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    const latest = Math.max(metrics.dataUpdatedAt || 0, requests.dataUpdatedAt || 0);
    if (latest > 0) {
      setLastFetchedAt(latest);
      setIsStale(Date.now() - latest > RUNTIME_STALE_THRESHOLD_MS);
    }
  }, [metrics.dataUpdatedAt, requests.dataUpdatedAt]);

  useEffect(() => {
    const timer = setInterval(
      () => setIsStale(Date.now() - lastFetchedAt > RUNTIME_STALE_THRESHOLD_MS),
      1_000,
    );
    return () => clearInterval(timer);
  }, [lastFetchedAt]);

  const data = metrics.data;
  const entries = requests.data?.entries ?? [];

  return (
    <>
      <section className="panel" aria-label="请求指标">
        <header className="panel-heading">
          <h2>请求指标</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {isStale && (
              <span className="badge" style={{ background: "#fef3c7", color: "#92400e" }}>
                <TriangleAlert size={13} style={{ marginRight: 4 }} />
                数据已陈旧（超过 15 秒）
              </span>
            )}
            <button
              type="button"
              aria-pressed={errorsOnly}
              style={errorsOnly ? { fontWeight: 600 } : undefined}
              onClick={() => setErrorsOnly(!errorsOnly)}
            >
              只看报错（两块都生效）
            </button>
            <button
              type="button"
              aria-pressed={humanOnly}
              style={humanOnly ? { fontWeight: 600 } : undefined}
              onClick={() => setHumanOnly(!humanOnly)}
            >
              只看人工操作（流水）
            </button>
            <button
              type="button"
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: ["runtime-metrics"] });
                void queryClient.invalidateQueries({ queryKey: ["runtime-requests"] });
                void queryClient.invalidateQueries({ queryKey: ["runtime-logs"] });
              }}
            >
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        </header>

        <p className="muted" style={{ padding: "0 22px", margin: "0 0 10px" }}>
          实时诊断：进程内存里最近 {REQUEST_LIMIT} 条，<strong>重启清零</strong>，
          而且<strong>包含自动轮询与公开请求</strong>——所以它天生比审计记录吵，那是它的工作。
          只记时间、方法、路由模板、状态与耗时；查询串、请求与响应内容、凭据都不记录。
          人工操作只看「只看人工操作」筛出来的那些；这份记录进程内、重启清零，
          没有可分页的持久历史界面（后台审计仍在照常写库，只是不再有独立页面）。
        </p>

        {metrics.isPending ? (
          <div style={{ padding: "0 22px 20px" }}>
            <LoadingState />
          </div>
        ) : metrics.isError ? (
          <div style={{ padding: "0 22px 20px" }}>
            <ErrorState error={metrics.error} retry={metrics.refetch} />
          </div>
        ) : data ? (
          <p aria-label="请求指标摘要" style={{ padding: "0 22px", margin: "0 0 14px" }}>
            已完成 <strong>{data.completed.toLocaleString("zh-CN")}</strong> · 失败{" "}
            <strong>{data.failed.toLocaleString("zh-CN")}</strong> · 成功{" "}
            <strong>{formatRuntimeRatio(data.successRate)}</strong> · 平均{" "}
            <strong>{formatRuntimeDuration(data.avgDurationMs)}</strong> · 进行中{" "}
            <strong>{data.inFlight}</strong> · 中断 <strong>{data.interrupted}</strong> · 端内运行{" "}
            {uptimeLabel(data.uptimeMs)}
            {data.droppedLogLines > 0 ? (
              <span className="muted">
                {" "}
                · 日志已覆盖 {data.droppedLogLines} 行（读数不完整）
              </span>
            ) : null}
            {data.droppedRequests > 0 ? (
              <span className="muted"> · 明细已覆盖 {data.droppedRequests} 条</span>
            ) : null}
          </p>
        ) : null}

        <h3 className="muted" style={{ fontSize: 13, margin: "0 0 6px", padding: "0 22px" }}>
          请求流水（最近 {REQUEST_LIMIT} 条）
        </h3>
        {requests.isPending ? (
          <div style={{ padding: "0 22px 20px" }}>
            <LoadingState />
          </div>
        ) : requests.isError ? (
          <div style={{ padding: "0 22px 20px" }}>
            <ErrorState error={requests.error} retry={requests.refetch} />
          </div>
        ) : entries.length === 0 ? (
          <div style={{ padding: "0 22px 20px" }}>
            <EmptyState title={emptyRequestCopy(errorsOnly, humanOnly).title}>
              {emptyRequestCopy(errorsOnly, humanOnly).hint}
            </EmptyState>
          </div>
        ) : (
          <pre
            aria-label="请求流水"
            style={{
              margin: "0 22px 20px",
              maxHeight: 280,
              overflow: "auto",
              padding: "10px 12px",
              background: "#0f172a0d",
              borderRadius: 8,
              fontSize: 12.5,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {entries.map((entry, index) => (
              <span
                key={index + ":" + entry.ts}
                style={{
                  display: "block",
                  ...(isRuntimeRequestError(entry) ? { color: "#b91c1c" } : {}),
                  ...(isRuntimeRequestInterrupted(entry) ? { color: "#92400e" } : {}),
                }}
              >
                {entry.background ? "[自动] " : ""}
                {requestLine(entry)}
              </span>
            ))}
          </pre>
        )}
      </section>

      <RuntimeLogStreamPanel errorsOnly={errorsOnly} />
    </>
  );
}
