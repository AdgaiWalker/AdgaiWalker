import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowRight, RefreshCw } from "lucide-react";
import {
  ACTIVITY_KIND_LABELS,
  ACTIVITY_KINDS,
  ACTIVITY_SEVERITY_LABELS,
  type ActivityCounts,
  type ActivityEvent,
  type ActivityKind,
} from "@walker/shared";
import { useActivity, useActivityCounts } from "../../api/queries";
import { EmptyState, ErrorState, LoadingState, Panel } from "../../components/States";
import { ADMIN_ROUTES as R } from "../../shared/routes";
import { timeLabel } from "../../shared/labels";

/**
 * 运营活动流：五个旧 tab（运行记录/访客对话/更新提醒/更新复盘/后台操作）合并成一条时间线。
 * 分类维度从"按表分"换成"按站主要干什么"——待办置顶，其余按事实时间倒序。
 *
 * 三条如实声明（对应 shared activity.ts 的纪律）：
 * - 翻更早用时间游标，各源只取最近 30 条参与归并——深处历史稀疏不均，翻得深建议按类型筛；
 * - 展开详情跳既有详情页（会话/运行），本页不复制第二套详情渲染；
 * - 顶部计数全部来自 /ops/overview 的 7 天口径，本页不发明任何新统计。
 */
const SEVERITY_STYLE: Record<string, { color?: string; fontWeight?: number }> = {
  todo: { color: "#1d4ed8" },
  error: { color: "#b91c1c", fontWeight: 600 },
  warn: { color: "#92400e" },
  info: {},
};

const KIND_BADGE_STYLE: Record<ActivityKind, { bg: string; color: string; border: string }> = {
  visitor: { bg: "#f5f3ff", color: "#6366f1", border: "#e0e7ff" },
  run: { bg: "#ecfeff", color: "#0891b2", border: "#cffafe" },
  reminder: { bg: "#fffbeb", color: "#d97706", border: "#fef3c7" },
  review: { bg: "#f0fdf4", color: "#16a34a", border: "#dcfce7" },
  admin: { bg: "#f8fafc", color: "#475569", border: "#e2e8f0" },
};

function CountCard({
  label,
  value,
  hint,
  kinds,
  setKinds,
}: {
  label: string;
  value: number | null;
  hint: string;
  kinds: string;
  setKinds: (next: string) => void;
}) {
  const isAlert = value !== null && value > 0;
  return (
    <button
      type="button"
      className="metric"
      aria-label={label + "：" + (value === null ? "待核对" : value)}
      onClick={() => setKinds(kinds)}
      style={{
        textAlign: "left",
        cursor: "pointer",
        background: isAlert ? "linear-gradient(180deg, #ffffff 0%, #fffcf5 100%)" : "white",
        borderColor: isAlert ? "#fed7aa" : undefined,
        transition: "all 0.2s ease",
      }}
    >
      <AlertTriangle
        size={22}
        style={{
          color: isAlert ? "#d97706" : "#94a3b8",
          background: isAlert ? "#fef3c7" : "#f1f5f9",
          borderRadius: 8,
          padding: 3,
        }}
      />
      <span>
        {label}
        <strong>{value === null ? "—" : value.toLocaleString("zh-CN")}</strong>
        <small className="muted" style={{ display: "block", fontWeight: 400 }}>
          {hint}
        </small>
      </span>
    </button>
  );
}

/** 展开详情跳既有详情页；提醒/复盘没有独立详情页的回 null（只显示分类结果）。 */
function eventHref(event: ActivityEvent): string | null {
  if (event.kind === "visitor") {
    if (event.provenance.ref === "clue") return null;
    return R.conversationDetail(event.provenance.id);
  }
  if (event.kind === "run") return R.runDetail(event.provenance.id);
  return null;
}

/**
 * 筛选与游标都放 URL（replace 模式）：可分享、旧 tab 链接映射进来就能用；
 * 不刷历史记录——切筛选不该产生一串后退垃圾。
 */
export function ActivityStreamPanel() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const kinds = new URLSearchParams(location.search).get("kind") ?? "";
  const before = new URLSearchParams(location.search).get("before");

  /**
   * URL 写入只有一个入口：**一次 navigate 写全量**（kind + before）。
   * 之前 setKinds/setBefore 各写一次，后写的用旧闭包把前者刚写的参数覆盖掉——
   * 实测（活体浏览器与 jsdom 双复现）点「访客」URL 不变，就是这个双写竞态。
   * replace 不刷历史：切筛选不该产生一串后退垃圾。
   */
  const go = (nextKinds: string, nextBefore: string | null) => {
    const url = new URLSearchParams(nextKinds ? { kind: nextKinds } : {});
    if (nextBefore) url.set("before", nextBefore);
    const search = url.toString();
    navigate(search ? "?" + search : location.pathname, { replace: true });
  };

  const counts = useActivityCounts();
  const query = useActivity({ kinds, before });
  const data = query.data;
  const events = data?.events ?? [];
  const selected = kinds ? (kinds.split(",") as ActivityKind[]) : [];

  const toggleKind = (kind: ActivityKind) => {
    const next = selected.includes(kind)
      ? selected.filter((item) => item !== kind)
      : [...selected, kind];
    go(next.join(","), null);
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
    void queryClient.invalidateQueries({ queryKey: ["activity-counts"] });
    void query.refetch();
    void counts.refetch();
  };

  return (
    <>
      <Panel
        title="运营记录"
        action={
          <button type="button" onClick={refresh}>
            <RefreshCw size={16} />
            刷新
          </button>
        }
      >
        <p className="muted" style={{ margin: "0 0 12px" }}>
          一条时间线看全部：待办置顶，其余按事实时间倒序。翻更早建议按类型筛（每源参与归并的是最近{" "}
          {data?.sourceLimit ?? 30} 条，深处会稀疏不均，这是如实代价）。展开详情走既有详情页。
        </p>
        {counts.isPending ? (
          <LoadingState />
        ) : counts.isError ? (
          <ErrorState error={counts.error} retry={counts.refetch} />
        ) : counts.data ? (
          <div className="metrics" style={{ paddingBottom: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <CountCard
              label="未完成事项"
              value={counts.data.remindersPending}
              hint="提醒箱开放项 · 点它只看提醒"
              kinds="reminder"
              setKinds={(next) => go(next, null)}
            />
            <CountCard
              label="降级回答（7 天）"
              value={counts.data.answersDegraded}
              hint="与概览同一口径 · 点它只看访客"
              kinds="visitor"
              setKinds={(next) => go(next, null)}
            />
            <CountCard
              label="失败回答（7 天）"
              value={counts.data.runsFailed}
              hint="与概览同一口径 · 点它只看访客"
              kinds="visitor"
              setKinds={(next) => go(next, null)}
            />
            <CountCard
              label="发布未确证"
              value={counts.data.releaseWorkingAhead}
              hint={
                counts.data.releaseWorkingAhead === null
                  ? "没有已确证发布事实，待核对"
                  : "工作区领先最近一次确证发布 · 点它只看后台操作"
              }
              kinds="admin"
              setKinds={(next) => go(next, null)}
            />
          </div>
        ) : null}
      </Panel>

      <Panel title="时间线">
        <div className="toolbar" style={{ flexWrap: "wrap", gap: 6 }}>
          <button
            type="button"
            aria-pressed={selected.length === 0}
            style={{
              padding: "6px 14px",
              borderRadius: "20px",
              fontSize: "13px",
              ...(selected.length === 0
                ? { fontWeight: 600, background: "var(--accent)", color: "white", borderColor: "var(--accent)" }
                : {}),
            }}
            onClick={() => go("", null)}
          >
            全部
          </button>
          {ACTIVITY_KINDS.map((kind) => {
            const isSelected = selected.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={isSelected}
                style={{
                  padding: "6px 14px",
                  borderRadius: "20px",
                  fontSize: "13px",
                  ...(isSelected
                    ? { fontWeight: 600, background: "var(--accent)", color: "white", borderColor: "var(--accent)" }
                    : {}),
                }}
                onClick={() => toggleKind(kind)}
              >
                {ACTIVITY_KIND_LABELS[kind]}
              </button>
            );
          })}
        </div>

        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : events.length === 0 ? (
          <EmptyState title={selected.length ? "该类型暂无记录" : "暂无运营记录"}>
            {selected.length
              ? "换一个类型，或点「全部」看完整时间线。"
              : "有访客提问、执行运行、提醒到期或后台操作后，这里会出现。"}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 140 }}>时间</th>
                  <th style={{ width: 100 }}>类型</th>
                  <th>事件</th>
                  <th style={{ width: 120 }}>结果</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const style = SEVERITY_STYLE[event.severity] ?? {};
                  const href = eventHref(event);
                  const badgeStyle = KIND_BADGE_STYLE[event.kind] ?? {
                    bg: "#f1f5f9",
                    color: "#475569",
                    border: "#e2e8f0",
                  };
                  return (
                    <tr key={event.key}>
                      <td className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                        {timeLabel(event.ts)}
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 500,
                            background: badgeStyle.bg,
                            color: badgeStyle.color,
                            border: `1px solid ${badgeStyle.border}`,
                          }}
                        >
                          {ACTIVITY_KIND_LABELS[event.kind]}
                        </span>
                      </td>
                      <td style={style}>
                        {event.title}
                        {event.detail ? <small className="muted"> · {event.detail}</small> : null}
                      </td>
                      <td>
                        {href ? (
                          <Link
                            to={href}
                            className="muted"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              padding: "2px 8px",
                              borderRadius: "6px",
                              background:
                                event.severity === "error"
                                  ? "#fef2f2"
                                  : event.severity === "todo"
                                  ? "#eff6ff"
                                  : "#f8fafc",
                              border: `1px solid ${
                                event.severity === "error"
                                  ? "#fecaca"
                                  : event.severity === "todo"
                                  ? "#bfdbfe"
                                  : "#e2e8f0"
                              }`,
                              fontSize: 12,
                              ...style,
                            }}
                          >
                            {ACTIVITY_SEVERITY_LABELS[event.severity]}
                            <ArrowRight size={13} style={{ marginLeft: 2 }} />
                          </Link>
                        ) : (
                          <span
                            className="muted"
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              background:
                                event.severity === "error"
                                  ? "#fef2f2"
                                  : event.severity === "todo"
                                  ? "#eff6ff"
                                  : "#f8fafc",
                              border: `1px solid ${
                                event.severity === "error"
                                  ? "#fecaca"
                                  : event.severity === "todo"
                                  ? "#bfdbfe"
                                  : "#e2e8f0"
                              }`,
                              fontSize: 12,
                              ...style,
                            }}
                          >
                            {ACTIVITY_SEVERITY_LABELS[event.severity]}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="pagination">
          <button type="button" disabled={!before} onClick={() => go(kinds, null)}>
            回到最新
          </button>
          <button
            type="button"
            disabled={!data?.next}
            onClick={() => data?.next && go(kinds, data.next)}
          >
            <ArrowDown size={14} />
            加载更早
          </button>
        </div>
      </Panel>
    </>
  );
}
