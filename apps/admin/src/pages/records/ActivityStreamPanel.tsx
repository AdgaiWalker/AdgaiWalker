import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowRight, RefreshCw } from "lucide-react";
import {
  ACTIVITY_KIND_LABELS,
  ACTIVITY_KINDS,
  ACTIVITY_SEVERITY_LABELS,
  type ActivityEvent,
  type ActivityKind,
} from "@walker/shared";
import { useActivity, useActivityCounts } from "../../api/queries";
import { EmptyState, ErrorState, LoadingState, Panel } from "../../components/States";
import { ADMIN_ROUTES as R } from "../../shared/routes";
import { timeLabel } from "../../shared/labels";

const SEVERITY_STYLE: Record<string, { color?: string; fontWeight?: number }> = {
  todo: { color: "#1d4ed8" },
  error: { color: "#b91c1c", fontWeight: 600 },
  warn: { color: "#92400e" },
  info: {},
};

const KIND_BADGE: Record<ActivityKind, string> = {
  visitor: "badge purple",
  run: "badge blue",
  reminder: "badge amber",
  review: "badge green",
  admin: "badge",
};

const SEVERITY_BADGE: Record<string, string> = {
  error: "badge red",
  todo: "badge blue",
  warn: "badge amber",
  info: "badge",
};

function CountCard({ label, value, hint, onPick }: { label: string; value: number | null; hint: string; onPick: () => void }) {
  const isAlert = value !== null && value > 0;
  return (
    <button type="button" className={`metric ${isAlert ? "is-alert" : ""}`.trim()} aria-label={`${label}：${value === null ? "待核对" : value}`} onClick={onPick}>
      <AlertTriangle size={18} style={{ color: isAlert ? "#d97706" : "#94a3b8", flexShrink: 0, marginTop: 2 }} />
      <span>
        {label}
        <strong>{value === null ? "—" : value.toLocaleString("zh-CN")}</strong>
        <small className="muted" style={{ display: "block", fontWeight: 400 }}>{hint}</small>
      </span>
    </button>
  );
}

function eventHref(event: ActivityEvent): string | null {
  if (event.kind === "visitor") return event.provenance.ref === "clue" ? null : R.conversationDetail(event.provenance.id);
  if (event.kind === "run") return R.runDetail(event.provenance.id);
  return null;
}

export function ActivityStreamPanel() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const searchParams = new URLSearchParams(location.search);
  const kinds = searchParams.get("kind") ?? "";
  const before = searchParams.get("before");

  // 单入口 replace 写全量 URL，避免双写覆盖旧闭包
  const go = (nextKinds: string, nextBefore: string | null) => {
    const url = new URLSearchParams(nextKinds ? { kind: nextKinds } : {});
    if (nextBefore) url.set("before", nextBefore);
    const search = url.toString();
    navigate(search ? `?${search}` : location.pathname, { replace: true });
  };

  const counts = useActivityCounts();
  const query = useActivity({ kinds, before });
  const data = query.data;
  const events = data?.events ?? [];
  const selected = kinds ? (kinds.split(",") as ActivityKind[]) : [];

  const toggleKind = (kind: ActivityKind) => {
    const next = selected.includes(kind) ? selected.filter((k) => k !== kind) : [...selected, kind];
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
      <Panel title="运营记录" action={<button type="button" className="btn" onClick={refresh}><RefreshCw size={15} />刷新</button>}>
        <p className="muted" style={{ margin: "0 0 12px" }}>
          一条时间线看全部：待办置顶，其余按事实时间倒序（每源取最近 {data?.sourceLimit ?? 30} 条归并，深处翻页建议按类型筛）。
        </p>
        {counts.isPending ? (
          <LoadingState />
        ) : counts.isError ? (
          <ErrorState error={counts.error} retry={counts.refetch} />
        ) : counts.data ? (
          <div className="metrics">
            <CountCard label="未完成事项" value={counts.data.remindersPending} hint="待处理事项 · 点它只看提醒" onPick={() => go("reminder", null)} />
            <CountCard label="降级回答（7 天）" value={counts.data.answersDegraded} hint="近 7 天访客降级 · 点它只看访客" onPick={() => go("visitor", null)} />
            <CountCard label="失败回答（7 天）" value={counts.data.runsFailed} hint="近 7 天访客失败 · 点它只看访客" onPick={() => go("visitor", null)} />
            <CountCard
              label="发布未确证"
              value={counts.data.releaseWorkingAhead}
              hint={counts.data.releaseWorkingAhead === null ? "没有已确证发布事实，待核对" : "工作区领先最近一次确证发布"}
              onPick={() => go("admin", null)}
            />
          </div>
        ) : null}
      </Panel>

      <Panel title="时间线">
        <div className="toolbar">
          <button type="button" className="chip" aria-pressed={selected.length === 0} onClick={() => go("", null)}>全部</button>
          {ACTIVITY_KINDS.map((kind) => (
            <button key={kind} type="button" className="chip" aria-pressed={selected.includes(kind)} onClick={() => toggleKind(kind)}>
              {ACTIVITY_KIND_LABELS[kind]}
            </button>
          ))}
        </div>

        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : events.length === 0 ? (
          <EmptyState title={selected.length ? "该类型暂无记录" : "暂无运营记录"}>
            {selected.length ? "换一个类型，或点「全部」看完整时间线。" : "有访客提问、执行运行、提醒到期或后台操作后，这里会出现。"}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 130 }}>时间</th>
                  <th style={{ width: 90 }}>类型</th>
                  <th>事件</th>
                  <th style={{ width: 110 }}>结果</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const style = SEVERITY_STYLE[event.severity] ?? {};
                  const href = eventHref(event);
                  const sevCls = SEVERITY_BADGE[event.severity] ?? "badge";
                  return (
                    <tr key={event.key}>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>{timeLabel(event.ts)}</td>
                      <td><span className={KIND_BADGE[event.kind] ?? "badge"}>{ACTIVITY_KIND_LABELS[event.kind]}</span></td>
                      <td style={style}>
                        {event.title}
                        {event.detail ? <small className="muted"> · {event.detail}</small> : null}
                      </td>
                      <td>
                        {href ? (
                          <Link to={href} className={sevCls} style={style}>
                            {ACTIVITY_SEVERITY_LABELS[event.severity]}
                            <ArrowRight size={12} />
                          </Link>
                        ) : (
                          <span className={sevCls} style={style}>{ACTIVITY_SEVERITY_LABELS[event.severity]}</span>
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
          <button type="button" disabled={!before} onClick={() => go(kinds, null)}>回到最新</button>
          <button type="button" disabled={!data?.next} onClick={() => data?.next && go(kinds, data.next)}>
            <ArrowDown size={14} />加载更早
          </button>
        </div>
      </Panel>
    </>
  );
}
