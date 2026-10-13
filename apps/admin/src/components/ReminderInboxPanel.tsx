import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  Check,
  CircleSlash,
  Clock,
  RefreshCw,
} from "lucide-react";
import type { ReminderInbox, ReminderInboxItem } from "@walker/shared";
import { useDisposeReminder, useReminderInbox } from "../api/queries";
import { ErrorState, LoadingState } from "./States";
import { ADMIN_ROUTES as R } from "../shared/routes";
import { timeLabel } from "../shared/labels";

/** 5 秒可见轮询；页面隐藏时停轮询（与发布面板同一约定）。 */
const POLL_INTERVAL_MS = 5_000;
/** 超过该时长未刷新即标记陈旧：界面不假装数据是新的。 */
const STALE_THRESHOLD_MS = 15_000;

const dueStateLabel: Record<ReminderInboxItem["dueState"], string> = {
  overdue: "已到期",
  today: "今天到期",
  upcoming: "即将到期",
  undated: "未排期",
};

function DueBadge({ item }: { item: ReminderInboxItem }) {
  const Icon =
    item.dueState === "overdue"
      ? AlertTriangle
      : item.dueState === "today"
        ? BellRing
        : item.dueState === "upcoming"
          ? CalendarClock
          : Clock;
  const tone =
    item.dueState === "overdue" ? "red" : item.dueState === "today" ? "" : "";
  return (
    <span className={`badge ${tone}`.trim()}>
      <Icon size={13} style={{ marginRight: 4 }} />
      {dueStateLabel[item.dueState]}
    </span>
  );
}

export function ReminderInboxPanel({
  /** 内容详情页内嵌时传 slug：只显示该内容的提醒，并可在此新建。 */
  contentSlug,
}: {
  contentSlug?: string;
} = {}) {
  const [isVisible, setIsVisible] = useState(() =>
    typeof document !== "undefined" ? document.visibilityState === "visible" : true,
  );
  const [lastFetchedAt, setLastFetchedAt] = useState(() => Date.now());
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // 每个处置按钮自带 requestKey：重复点击复用同一键（服务端幂等），
  // 换一件事或换动作才换键，避免把不同操作当成同一次重试。
  const [requestKeys, setRequestKeys] = useState<Record<string, string>>({});

  const query = useReminderInbox({ refetchInterval: isVisible ? POLL_INTERVAL_MS : false });
  const dispose = useDisposeReminder();

  // 可见性感知：隐藏时停轮询（与发布面板同一约定）
  useEffect(() => {
    const onChange = () => setIsVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  // 记录最近一次成功拉取的时刻，用于陈旧标记
  useEffect(() => {
    if (query.dataUpdatedAt) setLastFetchedAt(query.dataUpdatedAt);
  }, [query.dataUpdatedAt]);

  // 陈旧判定在每次渲染时重算：5 秒轮询本身会持续触发渲染，
  // 轮询若停摆则不再渲染，此时时间差自然超过阈值——不需要额外的秒级定时器。
  const isStale = Date.now() - lastFetchedAt > STALE_THRESHOLD_MS;

  const [searchParams, setSearchParams] = useSearchParams();
  const scope = searchParams.get("scope");

  const data: ReminderInbox | undefined = query.data;

  const items = (data?.items ?? []).filter((item) => {
    if (contentSlug && item.contentSlug !== contentSlug) return false;
    if (scope === "overdue") return item.dueState === "overdue";
    return true;
  });

  const keyFor = (actionId: string, disposition: string) =>
    requestKeys[`${actionId}:${disposition}`] ?? crypto.randomUUID();

  async function handleDispose(
    item: ReminderInboxItem,
    disposition: "complete" | "snooze" | "ignore",
    plannedDate?: string,
    reason?: string,
  ) {
    setFeedback(null);
    const key = keyFor(item.actionId, disposition);
    setRequestKeys((current) => ({ ...current, [`${item.actionId}:${disposition}`]: key }));
    try {
      const result = await dispose.mutateAsync({
        actionId: item.actionId,
        disposition,
        plannedDate: plannedDate ?? null,
        reason: reason ?? null,
        requestKey: key,
      });
      setFeedback({
        kind: "ok",
        text: result.replayed
          ? "这次操作此前已生效（重复点击未产生第二次副作用）"
          : disposition === "complete"
            ? "已标记完成"
            : disposition === "snooze"
              ? `已延后到 ${plannedDate}`
              : "已忽略这次提醒",
      });
      await query.refetch();
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "操作失败" });
    }
  }

  return (
    <section className="panel">
      <header className="panel-heading">
        <h2>
          <BellRing size={18} style={{ marginRight: 6, verticalAlign: "-3px" }} />
          提醒箱
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isStale && (
            <span className="badge" style={{ background: "#fef3c7", color: "#92400e" }}>
              数据已陈旧（超过 15 秒未刷新）
            </span>
          )}
          <button type="button" onClick={() => void query.refetch()}>
            <RefreshCw size={16} />
            刷新
          </button>
        </div>
      </header>

      {data && (
        <p className="muted" style={{ padding: "0 22px" }}>
          站点时区 {data.timezone} · 今天 {data.today} · 已到期 {data.counts.overdue} · 今天{" "}
          {data.counts.today} · 即将 {data.counts.upcoming} · 未排期 {data.counts.undated} · 读取于{" "}
          {timeLabel(data.generatedAt)}
        </p>
      )}

      {scope === "overdue" && (
        <div
          className="notice"
          style={{ margin: "0 22px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <span>已应用筛选：仅显示已到期事项</span>
          <button
            type="button"
            className="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("scope");
              setSearchParams(next);
            }}
          >
            显示全部
          </button>
        </div>
      )}

      {feedback && (
        <div
          className="notice"
          style={{
            margin: "0 22px 14px",
            background: feedback.kind === "ok" ? "#f0fdf4" : "#fef2f2",
            color: feedback.kind === "ok" ? "#166534" : "#991b1b",
          }}
        >
          {feedback.text}
        </div>
      )}

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : items.length === 0 ? (
        <p className="muted" style={{ padding: "0 22px 20px" }}>
          当前没有待处理的提醒。为内容设置某日提醒后，到期会出现在这里。
        </p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>事项</th>
                <th>到期</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.actionId}>
                  <td>
                    <strong>{item.title}</strong>
                    {item.contentSlug && (
                      <>
                        {" "}
                        <Link to={R.contentDetail(item.contentSlug)}>{item.contentSlug}</Link>
                      </>
                    )}
                    {item.note && <small style={{ display: "block" }}>{item.note}</small>}
                  </td>
                  <td>
                    {item.plannedDate ?? "未排期"}
                    {item.dueAt && (
                      <small style={{ display: "block", color: "var(--muted)" }}>
                        UTC {item.dueAt}
                      </small>
                    )}
                  </td>
                  <td>
                    <DueBadge item={item} />
                    {item.occurrenceOutcome === "IGNORED" && (
                      <small style={{ display: "block" }}>本次已忽略</small>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="button"
                        disabled={dispose.isPending}
                        onClick={() => void handleDispose(item, "complete")}
                      >
                        <Check size={13} />
                        完成
                      </button>
                      <button
                        type="button"
                        className="button"
                        disabled={dispose.isPending}
                        onClick={() => {
                          // 延后 +7 天：用本地日期计算，避免 UTC 偏移把日期算错一天
                          const base = item.plannedDate ? new Date(`${item.plannedDate}T00:00:00`) : new Date();
                          base.setDate(base.getDate() + 7);
                          const next = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
                          void handleDispose(item, "snooze", next);
                        }}
                      >
                        <CalendarClock size={13} />
                        延后 7 天
                      </button>
                      <button
                        type="button"
                        className="button"
                        disabled={dispose.isPending}
                        onClick={() => void handleDispose(item, "ignore", undefined, "在提醒箱里忽略")}
                      >
                        <CircleSlash size={13} />
                        忽略
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
