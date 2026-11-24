import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, TriangleAlert } from "lucide-react";
import {
  RUNTIME_REQUEST_OUTCOME_LABELS, formatRuntimeDuration, formatRuntimeRatio,
  isRuntimeRequestError, isRuntimeRequestInterrupted, type RuntimeRequestEntry,
} from "@walker/shared";
import { useRuntimeMetrics, useRuntimeRequests } from "../../api/queries";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { RUNTIME_POLL_INTERVAL_MS, RUNTIME_STALE_THRESHOLD_MS, RuntimeLogStreamPanel } from "./RuntimeLogStreamPanel";

const REQUEST_LIMIT = 200;

function uptimeLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} 分 ${s % 60} 秒` : `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
}

function timeOf(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "--:--:--" : d.toLocaleTimeString("zh-CN", { hour12: false });
}

function emptyRequestCopy(errorsOnly: boolean, humanOnly: boolean): { title: string; hint: string } {
  if (!errorsOnly && !humanOnly) return { title: "暂无请求记录", hint: "有请求打到 API 就会出现在这里（含 4xx / 5xx 与自动轮询）。" };
  const filters = [errorsOnly ? "只看报错" : null, humanOnly ? "只看人工操作" : null].filter(Boolean).join(" + ");
  return { title: `${filters}时没有匹配的请求记录`, hint: "这里不会用未筛选的记录顶替；关掉筛选可以看到全部请求。" };
}

const requestLine = (e: RuntimeRequestEntry) =>
  [timeOf(e.ts), `${e.method} ${e.route}`, `${e.status} ${RUNTIME_REQUEST_OUTCOME_LABELS[e.outcome]}`, formatRuntimeDuration(e.durationMs), e.requestId ?? "—"].join("  |  ");

export function RuntimeMonitorPanel() {
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [humanOnly, setHumanOnly] = useState(false);
  const [isVisible, setIsVisible] = useState(() => (typeof document === "undefined" ? true : document.visibilityState === "visible"));
  const [lastFetchedAt, setLastFetchedAt] = useState(() => Date.now());
  const [isStale, setIsStale] = useState(false);
  const queryClient = useQueryClient();

  const interval = isVisible ? RUNTIME_POLL_INTERVAL_MS : false;
  const metrics = useRuntimeMetrics({ refetchInterval: interval });
  const requests = useRuntimeRequests({ limit: REQUEST_LIMIT, errorsOnly, humanOnly, refetchInterval: interval });

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
    const t = setInterval(() => setIsStale(Date.now() - lastFetchedAt > RUNTIME_STALE_THRESHOLD_MS), 1_000);
    return () => clearInterval(t);
  }, [lastFetchedAt]);

  const data = metrics.data;
  const entries = requests.data?.entries ?? [];
  const empty = emptyRequestCopy(errorsOnly, humanOnly);

  return (
    <>
      <section className="panel stack" aria-label="请求指标">
        <header className="panel-heading" style={{ marginBottom: 0 }}>
          <h2>请求指标</h2>
          <div className="action-row">
            {isStale ? <span className="badge amber"><TriangleAlert size={13} />数据已陈旧（超过 15 秒）</span> : null}
            <button type="button" className={`chip ${errorsOnly ? "is-active" : ""}`} aria-pressed={errorsOnly} onClick={() => setErrorsOnly(!errorsOnly)}>只看报错（两块都生效）</button>
            <button type="button" className={`chip ${humanOnly ? "is-active" : ""}`} aria-pressed={humanOnly} onClick={() => setHumanOnly(!humanOnly)}>只看人工操作（流水）</button>
            <button type="button" className="btn" onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["runtime-metrics"] });
              void queryClient.invalidateQueries({ queryKey: ["runtime-requests"] });
              void queryClient.invalidateQueries({ queryKey: ["runtime-logs"] });
            }}><RefreshCw size={14} />刷新</button>
          </div>
        </header>
        <p className="muted" style={{ margin: 0 }}>进程内存最近 {REQUEST_LIMIT} 条（重启清零、fail-open，不含 query 与凭据）。</p>
        {metrics.isPending ? <LoadingState /> : metrics.isError ? <ErrorState error={metrics.error} retry={metrics.refetch} /> : data ? (
          <p aria-label="请求指标摘要" style={{ margin: 0 }}>
            已完成 <strong>{data.completed.toLocaleString("zh-CN")}</strong> · 失败 <strong>{data.failed.toLocaleString("zh-CN")}</strong> · 成功 <strong>{formatRuntimeRatio(data.successRate)}</strong> · 平均 <strong>{formatRuntimeDuration(data.avgDurationMs)}</strong> · 进行中 <strong>{data.inFlight}</strong> · 中断 <strong>{data.interrupted}</strong> · 端内运行 {uptimeLabel(data.uptimeMs)}
            {data.droppedLogLines > 0 ? <span className="muted"> · 日志已覆盖 {data.droppedLogLines} 行（读数不完整）</span> : null}
            {data.droppedRequests > 0 ? <span className="muted"> · 明细已覆盖 {data.droppedRequests} 条</span> : null}
          </p>
        ) : null}
        {requests.isPending ? <LoadingState /> : requests.isError ? <ErrorState error={requests.error} retry={requests.refetch} /> : entries.length === 0 ? (
          <EmptyState title={empty.title}>{empty.hint}</EmptyState>
        ) : (
          <pre aria-label="请求流水" className="runtime-pre">
            {entries.map((entry, idx) => (
              <span key={`${idx}:${entry.ts}`} style={{ display: "block", ...(isRuntimeRequestError(entry) ? { color: "#b91c1c" } : {}), ...(isRuntimeRequestInterrupted(entry) ? { color: "#92400e" } : {}) }}>
                {entry.background ? "[自动] " : ""}{requestLine(entry)}
              </span>
            ))}
          </pre>
        )}
      </section>

      <RuntimeLogStreamPanel errorsOnly={errorsOnly} />
    </>
  );
}
