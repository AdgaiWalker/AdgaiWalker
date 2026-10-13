import { useLayoutEffect, useRef, useState } from "react";
import {
  RUNTIME_LOG_CHANNEL_LABELS,
  RUNTIME_LOG_CHANNELS,
  isRuntimeErrorEntry,
  isRuntimeWarningEntry,
  type RuntimeLogChannel,
  type RuntimeLogEntry,
} from "@walker/shared";
import { useRuntimeLogs } from "../../api/queries";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";

/** 与关键数据同一约定：5 秒可见轮询，隐藏标签页停轮询。 */
export const RUNTIME_POLL_INTERVAL_MS = 5_000;
/** 超过 15 秒没拿到新事实即标陈旧（不假装还是新的）。 */
export const RUNTIME_STALE_THRESHOLD_MS = 15_000;
/** 一次取多少行：与后端缓冲上限同一数量级，不做无限流。 */
export const RUNTIME_LOG_LIMIT = 500;

const CHANNEL_FILTERS: Array<{ value: RuntimeLogChannel | "all"; label: string }> = [
  { value: "all", label: "全部" },
  ...RUNTIME_LOG_CHANNELS.map((channel) => ({
    value: channel,
    label: RUNTIME_LOG_CHANNEL_LABELS[channel],
  })),
];

/** 颜色只由 shared 的判级决定，界面不自己写正则（红=报错，黄=警告）。 */
function lineStyle(entry: RuntimeLogEntry): { color?: string } {
  if (isRuntimeErrorEntry(entry)) return { color: "#b91c1c" };
  if (isRuntimeWarningEntry(entry)) return { color: "#92400e" };
  return {};
}

function timeOf(ts: string): string {
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? "--:--:--" : date.toLocaleTimeString("zh-CN", { hour12: false });
}

export function RuntimeLogStreamPanel({ errorsOnly }: { errorsOnly: boolean }) {
  const [channel, setChannel] = useState<RuntimeLogChannel | "all">("all");
  const [pinned, setPinned] = useState(true);
  const boxRef = useRef<HTMLPreElement | null>(null);
  const atBottomRef = useRef(true);

  const query = useRuntimeLogs({
    limit: RUNTIME_LOG_LIMIT,
    ...(channel === "all" ? {} : { channel }),
    errorsOnly,
    refetchInterval: RUNTIME_POLL_INTERVAL_MS,
  });
  const data = query.data;

  // 只有"用户本来就在底部"时才跟随新行：往上翻看历史时不许把视图拽回去。
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    if (pinned && atBottomRef.current) box.scrollTop = box.scrollHeight;
  }, [pinned, data]);

  const entries = data?.entries ?? [];
  const counts = data?.counts ?? { task: 0, chat: 0, sys: 0 };
  const note =
    channel === "all"
      ? "任务 " + counts.task + " · 对话 " + counts.chat + " · 系统 " + counts.sys
      : RUNTIME_LOG_CHANNEL_LABELS[channel] + " " + entries.length + " 行";

  return (
    <section className="panel" aria-label="运行日志">
      <header className="panel-heading">
        <h2>运行日志</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {CHANNEL_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className="button"
              aria-pressed={channel === filter.value}
              style={channel === filter.value ? { fontWeight: 600 } : undefined}
              onClick={() => setChannel(filter.value)}
            >
              {filter.label}
            </button>
          ))}
          <span className="muted">{note}</span>
          <button type="button" aria-pressed={pinned} onClick={() => setPinned(!pinned)}>
            自动滚动：{pinned ? "开" : "关"}
          </button>
        </div>
      </header>

      <p className="muted" style={{ padding: "0 22px", margin: "0 0 8px" }}>
        只显示本进程已采集的最近 {RUNTIME_LOG_LIMIT} 行；日志采集失败只影响这里，
        不影响业务（后台操作审计是相反的语义：写不进去就拒绝执行）。
        {data && data.dropped > 0 ? (
          <strong> 已因容量上限覆盖 {data.dropped} 行，读数不完整。</strong>
        ) : null}
      </p>

      {query.isPending ? (
        <div style={{ padding: "0 22px 20px" }}>
          <LoadingState />
        </div>
      ) : query.isError ? (
        <div style={{ padding: "0 22px 20px" }}>
          <ErrorState error={query.error} retry={query.refetch} />
        </div>
      ) : entries.length === 0 ? (
        <div style={{ padding: "0 22px 20px" }}>
          {errorsOnly ? (
            <EmptyState title="只看报错时没有匹配的运行日志">
              关掉「只看报错」可以看到全部频道；这里不会用未筛选的内容顶替。
            </EmptyState>
          ) : (
            <EmptyState title="暂无运行日志">
              服务一启动就会写入；API 进程崩溃或启动失败时这里天然看不到——那种情况要看终端。
            </EmptyState>
          )}
        </div>
      ) : (
        <pre
          ref={boxRef}
          aria-label="运行日志流"
          onScroll={(event) => {
            const box = event.currentTarget;
            atBottomRef.current = box.scrollTop + box.clientHeight >= box.scrollHeight - 24;
          }}
          style={{
            margin: "0 22px 20px",
            maxHeight: 360,
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
            // 同一毫秒内的相同文本会撞 key：加上下标保证唯一（顺序即时间顺序）
            <span key={index + ":" + entry.ts} style={{ display: "block", ...lineStyle(entry) }}>
              {channel === "all" ? "[" + RUNTIME_LOG_CHANNEL_LABELS[entry.channel] + "] " : ""}
              {timeOf(entry.ts)} {entry.text}
              {entry.truncated ? "（已截断）" : ""}
            </span>
          ))}
        </pre>
      )}
    </section>
  );
}
