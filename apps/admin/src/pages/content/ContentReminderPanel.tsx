import { useState } from "react";
import { BellPlus, CalendarClock } from "lucide-react";
import { useCreateContentReminder } from "../../api/queries";
import { ReminderInboxPanel } from "../../components/ReminderInboxPanel";

/** 默认提前 3 天提醒：内容更新的常见节奏，站主可改。 */
function defaultPlannedDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * 内容详情的提醒入口（O04）。
 *
 * 只做两件事：为这篇文章设置某日提醒（复用既有 Action，entityType=CONTENT），
 * 以及复用同一个提醒箱组件处理该内容的到期项。**不新增第五个主工作面**。
 */
export function ContentReminderPanel({ slug, title }: { slug: string; title: string }) {
  const [plannedDate, setPlannedDate] = useState(defaultPlannedDate);
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [inboxRevision, setInboxRevision] = useState(0);
  const create = useCreateContentReminder();

  async function submit() {
    setFeedback(null);
    try {
      const created = await create.mutateAsync({ slug, title: `更新：${title}`, plannedDate, note });
      setFeedback({
        kind: "ok",
        text: `已设置提醒：${plannedDate}（站点时区当日 00:00 到期，UTC ${created.dueAt ?? "—"}）`,
      });
      setNote("");
      // 让提醒箱重新拉取，新提醒立刻可见
      setInboxRevision((n) => n + 1);
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "设置提醒失败",
      });
    }
  }

  return (
    <>
      <section className="panel">
        <header className="panel-heading">
          <h2>
            <BellPlus size={18} style={{ marginRight: 6, verticalAlign: "-3px" }} />
            为这篇文章设置提醒
          </h2>
        </header>
        <div style={{ padding: "0 22px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <p className="muted" style={{ margin: 0 }}>
            提醒复用已有事项，不新建任务中心。到期由后台每 5 分钟扫描；提醒系统不依赖 AI，
            关闭 AI 时同样工作。
          </p>
          {feedback && (
            <div
              className="notice"
              style={{
                background: feedback.kind === "ok" ? "#f0fdf4" : "#fef2f2",
                color: feedback.kind === "ok" ? "#166534" : "#991b1b",
              }}
            >
              {feedback.text}
            </div>
          )}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="muted">提醒日期（站点本地日期）</span>
              <input
                type="date"
                aria-label="提醒日期"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 200 }}>
              <span className="muted">备注（可选）</span>
              <input
                type="text"
                aria-label="提醒备注"
                placeholder="例如：核对数据后更新结论"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="button primary"
              disabled={create.isPending || !plannedDate}
              onClick={() => void submit()}
            >
              <CalendarClock size={15} />
              {create.isPending ? "正在设置..." : "设置提醒"}
            </button>
          </div>
        </div>
      </section>

      {/* key 变化触发重新挂载，从而立即拉取刚创建的提醒 */}
      <ReminderInboxPanel key={inboxRevision} contentSlug={slug} />
    </>
  );
}
