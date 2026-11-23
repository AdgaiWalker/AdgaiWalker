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

export const RUNTIME_POLL_INTERVAL_MS = 5_000;
export const RUNTIME_STALE_THRESHOLD_MS = 15_000;
export const RUNTIME_LOG_LIMIT = 500;

const CHANNEL_FILTERS: Array<{ value: RuntimeLogChannel | "all"; label: string }> = [
  { value: "all", label: "全部" },
  ...RUNTIME_LOG_CHANNELS.map((c) => ({ value: c, label: RUNTIME_LOG_CHANNEL_LABELS[c] })),
];

function lineStyle(entry: RuntimeLogEntry): { color?: string } {
  if (isRuntimeErrorEntry(entry)) return { color: "#b91c1c" };
  if (isRuntimeWarningEntry(entry)) return { color: "#92400e" };
  return {};
}

function timeOf(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "--:--:--" : d.toLocaleTimeString("zh-CN", { hour12: false });
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

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box && pinned && atBottomRef.current) box.scrollTop = box.scrollHeight;
  }, [pinned, data]);

  const entries = data?.entries ?? [];
  const counts = data?.counts ?? { task: 0, chat: 0, sys: 0 };
  const note =
    channel === "all"
      ? `任务 ${counts.task} · 对话 ${counts.chat} · 系统 ${counts.sys}`
      : `${RUNTIME_LOG_CHANNEL_LABELS[channel]} ${entries.length} 行`;

  return (
    <section className="panel stack" aria-label="运行日志">
      <header className="panel-heading" style={{ marginBottom: 0 }}>
        <h2>运行日志</h2>
        <div className="action-row">
          {CHANNEL_FILTERS.map((f) => (
            <button key={f.value} type="button" className="chip" aria-pressed={channel === f.value} onClick={() => setChannel(f.value)}>
              {f.label}
            </button>
          ))}
          <span className="muted">{note}</span>
          <button type="button" className="btn btn-ghost" aria-pressed={pinned} onClick={() => setPinned(!pinned)}>
            自动滚动：{pinned ? "开" : "关"}
          </button>
        </div>
      </header>

      {data && data.dropped > 0 ? <p className="muted" style={{ margin: 0 }}><strong>已因容量上限覆盖 {data.dropped} 行，读数不完整。</strong></p> : null}

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : entries.length === 0 ? (
        errorsOnly ? (
          <EmptyState title="只看报错时没有匹配的运行日志">关掉「只看报错」可以看到全部频道；这里不会用未筛选的内容顶替。</EmptyState>
        ) : (
          <EmptyState title="暂无运行日志">服务启动后自动写入；进程崩溃或启动失败时请查看终端日志。</EmptyState>
        )
      ) : (
        <pre
          ref={boxRef}
          aria-label="运行日志流"
          className="runtime-pre"
          onScroll={(e) => {
            const box = e.currentTarget;
            atBottomRef.current = box.scrollTop + box.clientHeight >= box.scrollHeight - 24;
          }}
        >
          {entries.map((entry, idx) => (
            <span key={`${idx}:${entry.ts}`} style={{ display: "block", ...lineStyle(entry) }}>
              {channel === "all" ? `[${RUNTIME_LOG_CHANNEL_LABELS[entry.channel]}] ` : ""}
              {timeOf(entry.ts)} {entry.text}
              {entry.truncated ? "（已截断）" : ""}
            </span>
          ))}
        </pre>
      )}
    </section>
  );
}
