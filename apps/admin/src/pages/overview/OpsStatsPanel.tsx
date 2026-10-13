import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BellRing,
  Bot,
  Clock,
  FileText,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import type { OpsOverviewStats, OpsStatsWindow } from "@walker/shared";
import { OPS_STATS_WINDOWS } from "@walker/shared";
import { useOpsOverview } from "../../api/queries";
import { ErrorState, LoadingState } from "../../components/States";
import { ADMIN_ROUTES as R } from "../../shared/routes";
import { timeLabel } from "../../shared/labels";

/** 5 秒可见轮询（验收要求）；隐藏标签页时停轮询。 */
const POLL_INTERVAL_MS = 5_000;
/** 超过 15 秒未刷新即标记陈旧（与发布面板同一约定）。 */
const STALE_THRESHOLD_MS = 15_000;

const WINDOW_LABELS: Record<OpsStatsWindow, string> = {
  "24h": "近 24 小时",
  "7d": "近 7 天",
  "30d": "近 30 天",
};

/** 比率显示：null 一律写「—」，不写成 0% 或 100%。 */
function percent(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(value === 0 || value === 1 ? 0 : 1)}%`;
}

function numberOrDash(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("zh-CN");
}

/** 下钻目标：route 决定跳到哪个主工作面，filter 保证口径与数字一致。 */
function drilldownHref(route: string, filter: string): string {
  const base =
    route === "content" ? R.content : route === "records" ? R.records : route === "agents" ? R.agents : R.overview;
  return filter ? `${base}?${filter}` : base;
}

export function OpsStatsPanel() {
  const [window, setWindow] = useState<OpsStatsWindow>("7d");
  const [isVisible, setIsVisible] = useState(
    () => (typeof document === "undefined" ? true : document.visibilityState === "visible"),
  );
  const [lastFetchedAt, setLastFetchedAt] = useState(() => Date.now());
  const [isStale, setIsStale] = useState(false);
  const queryClient = useQueryClient();

  const query = useOpsOverview({
    window,
    refetchInterval: isVisible ? POLL_INTERVAL_MS : false,
  });

  useEffect(() => {
    const onChange = () => setIsVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    if (query.dataUpdatedAt) {
      setLastFetchedAt(query.dataUpdatedAt);
      setIsStale(Date.now() - query.dataUpdatedAt > STALE_THRESHOLD_MS);
    }
  }, [query.dataUpdatedAt]);

  // 每秒重算陈旧：轮询若停摆则不再有渲染，时间差自然越过阈值
  useEffect(() => {
    const timer = setInterval(
      () => setIsStale(Date.now() - lastFetchedAt > STALE_THRESHOLD_MS),
      1_000,
    );
    return () => clearInterval(timer);
  }, [lastFetchedAt]);

  const data: OpsOverviewStats | undefined = query.data;

  const cards = useMemo(() => {
    if (!data) return [];
    return [
      {
        key: "asks",
        label: "访客提问",
        value: data.asks.visitorMessages,
        hint: `${data.asks.conversations} 段会话 · ${data.asks.turns} 轮 · 重生成 ${data.asks.regenerationAttempts} 次`,
        icon: Activity,
        href: drilldownHref("records", "tab=visitors"),
      },
      {
        key: "answers",
        label: "回答结果",
        value: data.answers.succeeded,
        hint: `降级 ${data.answers.degraded} · 失败 ${data.answers.failed} · 未知 ${data.answers.unknown}`,
        icon: Bot,
        href: drilldownHref("records", "tab=visitors"),
      },
      {
        key: "delivery",
        label: "访客已确认收到",
        value: data.answers.deliveryAck,
        hint: `未确认送达 ${data.answers.deliveryUnconfirmed}（生成成功 ≠ 已送达）`,
        icon: BellRing,
        href: drilldownHref("records", "tab=visitors"),
      },
      {
        key: "overdue",
        label: "已到期事项",
        value: data.reminders.overdue,
        hint: `未完成合计 ${data.reminders.open} · 发生记录 ${data.reminders.occurrencesCreated}`,
        icon: AlertTriangle,
        href: drilldownHref("overview", "scope=overdue"),
      },
      {
        key: "ready",
        label: "工作区有改动",
        value: data.content.stages.ready,
        hint: `待审 ${data.content.stages.review} · 草稿 ${data.content.stages.draft} · Git 已同步 ${data.content.stages.live}`,
        icon: FileText,
        href: drilldownHref("content", "stage=ready"),
      },
      {
        key: "index",
        label: "问答索引落后",
        value: data.content.publicationAvailable ? data.content.versionStates.indexBehind : null,
        hint: data.content.publicationAvailable
          ? `版本一致 ${data.content.versionStates.inSync} · 索引待核对 ${data.content.versionStates.indexUnknown} · 正本与线上不同 ${data.content.versionStates.workingAhead}`
          : "发布事实暂不可读取，状态待核对",
        icon: Clock,
        href: drilldownHref("content", "version=index-behind"),
      },
    ];
  }, [data]);

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} retry={query.refetch} />;
  if (!data) return null;

  const empty =
    data.asks.visitorMessages === 0 &&
    data.reminders.open === 0 &&
    data.content.changes === 0 &&
    data.content.releases === 0;

  return (
    <section className="panel" aria-label="关键数据">
      <header className="panel-heading">
        <h2>
          <Activity size={18} style={{ marginRight: 6, verticalAlign: "-3px" }} />
          关键数据
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {OPS_STATS_WINDOWS.map((option) => (
            <button
              key={option}
              type="button"
              className="button"
              aria-pressed={window === option}
              style={window === option ? { fontWeight: 600 } : undefined}
              onClick={() => setWindow(option)}
            >
              {WINDOW_LABELS[option]}
            </button>
          ))}
          {isStale && (
            <span className="badge" style={{ background: "#fef3c7", color: "#92400e" }}>
              <TriangleAlert size={13} style={{ marginRight: 4 }} />
              数据已陈旧（超过 15 秒）
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["ops-overview"] });
              void query.refetch();
            }}
          >
            <RefreshCw size={16} />
            刷新
          </button>
        </div>
      </header>

      <p className="muted" style={{ padding: "0 22px" }}>
        窗口 {data.provenance.window}（{data.provenance.hours} 小时）· 统计截至{" "}
        {timeLabel(data.provenance.to)} · 每 5 秒自动刷新
      </p>

      {empty ? (
        <div style={{ padding: "0 22px 20px" }}>
          <p className="muted">
            这个窗口还没有数据。可以先去<Link to={R.content}>浏览内容</Link>，
            或在内容详情里设置提醒——数字会随真实事实出现，这里不画趋势图。
          </p>
        </div>
      ) : (
        <div className="metrics" style={{ padding: "0 22px 10px" }}>
          {cards.map(({ key, label, value, hint, icon: Icon, href }) => value === null ? (
            <div key={key} className="metric" aria-label={`${label}：待核对`}>
              <Icon size={28} />
              <span>{label}<strong>—</strong><small className="muted" style={{ display: "block", fontWeight: 400 }}>{hint}</small></span>
            </div>
          ) : (
            <Link to={href} key={key} className="metric" aria-label={`${label}：${value}，查看明细`}>
              <Icon size={28} />
              <span>
                {label}
                <strong>{value.toLocaleString("zh-CN")}</strong>
                <small className="muted" style={{ display: "block", fontWeight: 400 }}>
                  {hint}
                </small>
              </span>
            </Link>
          ))}
        </div>
      )}

      <details style={{ padding: "0 22px 18px" }}>
        <summary className="muted">口径与来源（每个数字都能追到明细）</summary>
        <div style={{ marginTop: 10 }}>
          <p className="muted" style={{ margin: "0 0 6px" }}>
            用量：{numberOrDash(data.usage.totalTokens)} tokens（覆盖 {percent(data.usage.coverage)}，
            共 {data.usage.runs} 次运行，其中 {data.usage.runsWithUsage} 次带用量记录）。
            <strong>缺失不计 0</strong>：没有记录时显示「—」。
          </p>
          <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
            {data.provenance.sources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
          {data.provenance.missing.map((item) => (
            <p key={item.key} className="muted" style={{ margin: "6px 0 0" }}>
              <TriangleAlert size={13} style={{ marginRight: 4, verticalAlign: "-2px" }} />
              {item.key}：{item.note}（覆盖 {percent(item.coverage)}）
            </p>
          ))}
        </div>
      </details>

      <div style={{ padding: "0 22px 20px" }}>
        <h3 className="muted" style={{ fontSize: 13, margin: "0 0 6px" }}>
          按明细下钻
        </h3>
        <div className="quick-links">
          {data.drilldowns.map((item) => (
            <Link key={item.key} to={drilldownHref(item.route, item.filter)}>
              {item.label}
              <strong style={{ marginLeft: 6 }}>{item.count.toLocaleString("zh-CN")}</strong>
              <ArrowRight size={16} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
