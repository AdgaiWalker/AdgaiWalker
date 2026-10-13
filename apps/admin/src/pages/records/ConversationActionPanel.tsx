import { useState } from "react";
import { CalendarClock, ListPlus, TriangleAlert } from "lucide-react";
import {
  useConvertConversationToAction,
  useConversationActionPreview,
} from "../../api/queries";
import { ApiError } from "../../api/http";
import { ErrorState, LoadingState } from "../../components/States";

type SubmittedConversion = {
  conversationId: string;
  title: string;
  plannedDate: string | null;
  messageIds: string[];
  requestKey: string;
};

function defaultPlannedDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * 访客对话详情里的「转为更新事项」（O05）。
 *
 * 显式操作：只有点按钮才创建；只保存站主确认过的摘要与消息引用，
 * **不复制完整会话正文**，也不授予 AI 任何内容写权限。
 */
export function ConversationActionPanel({ conversationId }: { conversationId: string }) {
  const preview = useConversationActionPreview(conversationId);
  const convert = useConvertConversationToAction();
  const [title, setTitle] = useState("");
  const [plannedDate, setPlannedDate] = useState(defaultPlannedDate);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [uncertainPayload, setUncertainPayload] = useState<SubmittedConversion | null>(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  if (preview.isPending) return <LoadingState />;
  if (preview.isError) return <ErrorState error={preview.error} retry={preview.refetch} />;
  const previewData = preview.data;
  if (!previewData) return null;

  const suggested = previewData.title;
  const effectiveTitle = title || suggested;

  async function submit(retry = false) {
    const payload = retry && uncertainPayload ? uncertainPayload : {
      conversationId,
      title: effectiveTitle,
      plannedDate: plannedDate || null,
      messageIds: [...previewData.messageIds],
      requestKey,
    };
    setFeedback(null);
    try {
      const result = await convert.mutateAsync(payload);
      setFeedback({
        kind: "ok",
        text: result.replayed
          ? "这次转换此前已生效（重复点击未创建第二条事项）"
          : `已创建更新事项（${result.action.id}）`,
      });
      setUncertainPayload(null);
      setConfirmAbandon(false);
      // 已成功：换新键，下一次是真正的又一次显式转换
      setRequestKey(crypto.randomUUID());
    } catch (error) {
      const definiteRejection = error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500;
      if (definiteRejection) {
        setUncertainPayload(null);
        setConfirmAbandon(false);
      } else {
        setUncertainPayload(payload);
      }
      setFeedback({
        kind: "error",
        text: definiteRejection
          ? error.message
          : `结果未确认。请原样重试以核对这次请求；${error instanceof Error ? error.message : "服务暂时不可用"}`,
      });
    }
  }

  function abandonAttempt() {
    setUncertainPayload(null);
    setConfirmAbandon(false);
    setRequestKey(crypto.randomUUID());
    setFeedback({ kind: "error", text: "已放弃本次核对。先前请求可能已经创建事项，重新提交可能重复创建。" });
  }

  return (
    <section className="panel">
      <header className="panel-heading">
        <h2>
          <ListPlus size={18} style={{ marginRight: 6, verticalAlign: "-3px" }} />
          转为更新事项
        </h2>
      </header>
      <div style={{ padding: "0 22px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="notice">
          <TriangleAlert size={16} aria-hidden="true" />
          <span>
            只保存下方摘要与消息引用（软引用）。会话被删除或超出保留期后，事项仍保留，
            但会如实显示「证据已不可用」。此操作不会授予 AI 修改内容的权限。
          </span>
        </div>

        {feedback && (
          <div
            className="notice"
            role={feedback.kind === "error" ? "alert" : "status"}
            style={{
              background: feedback.kind === "ok" ? "#f0fdf4" : "#fef2f2",
              color: feedback.kind === "ok" ? "#166534" : "#991b1b",
            }}
          >
            {feedback.text}
          </div>
        )}

        {uncertainPayload && (
          <div className="notice">
            <p>结果未确认：标题、提醒日期和消息引用已冻结。原样重试会沿用同一个请求键。</p>
            <div className="button-row">
              <button type="button" disabled={convert.isPending} onClick={() => void submit(true)}>原样重试</button>
              <button type="button" disabled={convert.isPending} onClick={() => setConfirmAbandon(true)}>放弃本次并重新编辑</button>
            </div>
            {confirmAbandon && (
              <div role="alert">
                <p>先前请求可能已经创建事项。放弃核对后使用新请求键，重新提交可能重复创建。</p>
                <button type="button" onClick={abandonAttempt}>确认放弃并编辑</button>
                <button type="button" onClick={() => setConfirmAbandon(false)}>继续核对</button>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 260 }}>
            <span className="muted">事项标题（默认取访客问题摘要）</span>
            <input
              type="text"
              aria-label="事项标题"
              placeholder={suggested}
              maxLength={500}
              value={title}
              disabled={Boolean(uncertainPayload) || convert.isPending}
              onChange={(e) => { setTitle(e.target.value); setRequestKey(crypto.randomUUID()); }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="muted">提醒日期（可留空）</span>
            <input
              type="date"
              aria-label="提醒日期"
              value={plannedDate}
              disabled={Boolean(uncertainPayload) || convert.isPending}
              onChange={(e) => { setPlannedDate(e.target.value); setRequestKey(crypto.randomUUID()); }}
            />
          </label>
          <button
            type="button"
            className="button primary"
            disabled={convert.isPending || Boolean(uncertainPayload)}
            onClick={() => void submit()}
          >
            <CalendarClock size={15} />
            {convert.isPending ? "正在创建..." : "创建事项"}
          </button>
        </div>

        <p className="muted" style={{ margin: 0 }}>
          摘要预览（只存这一段，不搬运完整会话）：{previewData.summary}
          {" · "}引用 {previewData.messageIds.length} 条消息 · 会话共 {previewData.turnCount} 轮
        </p>
      </div>
    </section>
  );
}
