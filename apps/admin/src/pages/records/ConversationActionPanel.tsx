import { useState } from "react";
import { CalendarClock, ListPlus, TriangleAlert } from "lucide-react";
import { useConvertConversationToAction, useConversationActionPreview } from "../../api/queries";
import { ApiError } from "../../api/http";
import { ErrorState, LoadingState } from "../../components/States";

type SubmittedConversion = { conversationId: string; title: string; plannedDate: string | null; messageIds: string[]; requestKey: string };

function defaultPlannedDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ConversationActionPanel({ conversationId }: { conversationId: string }) {
  const preview = useConversationActionPreview(conversationId);
  const convert = useConvertConversationToAction();
  const [title, setTitle] = useState("");
  const [plannedDate, setPlannedDate] = useState(defaultPlannedDate);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [uncertain, setUncertain] = useState<SubmittedConversion | null>(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  if (preview.isPending) return <LoadingState />;
  if (preview.isError) return <ErrorState error={preview.error} retry={preview.refetch} />;
  const data = preview.data;
  if (!data) return null;

  async function submit(retry = false) {
    const payload = retry && uncertain ? uncertain : {
      conversationId,
      title: title || data.title,
      plannedDate: plannedDate || null,
      messageIds: [...data.messageIds],
      requestKey,
    };
    setFeedback(null);
    try {
      const res = await convert.mutateAsync(payload);
      setFeedback({ kind: "ok", text: res.replayed ? "这次转换此前已生效（重复点击未创建第二条事项）" : `已创建更新事项（${res.action.id}）` });
      setUncertain(null); setConfirmAbandon(false); setRequestKey(crypto.randomUUID());
    } catch (error) {
      const definite = error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500;
      if (definite) { setUncertain(null); setConfirmAbandon(false); } else setUncertain(payload);
      setFeedback({
        kind: "error",
        text: definite ? error.message : `结果未确认。请原样重试以核对这次请求；${error instanceof Error ? error.message : "服务暂时不可用"}`,
      });
    }
  }

  function abandonAttempt() {
    setUncertain(null); setConfirmAbandon(false); setRequestKey(crypto.randomUUID());
    setFeedback({ kind: "error", text: "已放弃本次核对。先前请求可能已经创建事项，重新提交可能重复创建。" });
  }

  return (
    <section className="panel stack">
      <header className="panel-heading" style={{ marginBottom: 0 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 6 }}><ListPlus size={16} />转为更新事项</h2>
      </header>
      <div className="notice" style={{ marginBottom: 0 }}>
        <TriangleAlert size={15} aria-hidden="true" />
        <span>只保存摘要与消息软引用，不复制完整会话正文，也不会授予 AI 修改内容的权限。</span>
      </div>
      {feedback ? <div className="notice" role={feedback.kind === "error" ? "alert" : "status"} style={{ marginBottom: 0 }}>{feedback.text}</div> : null}
      {uncertain ? (
        <div className="notice" style={{ marginBottom: 0 }}>
          <p style={{ margin: 0 }}>结果未确认：标题、提醒日期和消息引用已冻结。原样重试会沿用同一个请求键。</p>
          <div className="button-row">
            <button type="button" disabled={convert.isPending} onClick={() => void submit(true)}>原样重试</button>
            <button type="button" disabled={convert.isPending} onClick={() => setConfirmAbandon(true)}>放弃本次并重新编辑</button>
          </div>
          {confirmAbandon ? (
            <div role="alert" className="action-row">
              <span>先前请求可能已经创建事项。放弃后重新提交可能重复创建。</span>
              <button type="button" onClick={abandonAttempt}>确认放弃并编辑</button>
              <button type="button" onClick={() => setConfirmAbandon(false)}>继续核对</button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="action-row" style={{ alignItems: "flex-end" }}>
        <label className="field-col" style={{ flex: 1, minWidth: 240 }}>
          <span className="muted">事项标题（默认取访客问题摘要）</span>
          <input type="text" aria-label="事项标题" placeholder={data.title} maxLength={500} value={title} disabled={Boolean(uncertain) || convert.isPending} onChange={(e) => { setTitle(e.target.value); setRequestKey(crypto.randomUUID()); }} />
        </label>
        <label className="field-col">
          <span className="muted">提醒日期</span>
          <input type="date" aria-label="提醒日期" value={plannedDate} disabled={Boolean(uncertain) || convert.isPending} onChange={(e) => { setPlannedDate(e.target.value); setRequestKey(crypto.randomUUID()); }} />
        </label>
        <button type="button" className="btn btn-primary" disabled={convert.isPending || Boolean(uncertain)} onClick={() => void submit()}>
          <CalendarClock size={14} />{convert.isPending ? "正在创建…" : "创建事项"}
        </button>
      </div>
      <p className="muted" style={{ margin: 0 }}>摘要预览：{data.summary} · 引用 {data.messageIds.length} 条消息 · 会话共 {data.turnCount} 轮</p>
    </section>
  );
}
