import { ArrowLeft, Bot, Clock3, MessageSquareText } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useConversationLogDetail } from "../../api/queries";
import { MarkdownPreview } from "../../components/MarkdownPreview";
import { EmptyState, ErrorState, LoadingState, PageHeading } from "../../components/States";
import { findPlacement, HOME_XIAOYING_PLACEMENT, PUBLIC_SITE_SCOPE, type ConversationLogDetail, type ConversationLogRun } from "@walker/shared";
import { ADMIN_ROUTES as R } from "../../shared/routes";
import { statusLabel, timeLabel } from "../../shared/labels";
import { ConversationActionPanel } from "./ConversationActionPanel";

const DELIVERY: Record<string, string> = { pending: "待发送", partial: "部分发送", sent: "已发送", ack: "访客已确认收到", unknown: "送达未知" };
const EVENTS: Record<string, string> = {
  expose: "介绍展示", "intro-dismiss": "关闭介绍", open: "打开助手", close: "关闭助手", send: "发送问题", "follow-up": "继续提问",
  "member-switch": "切换 Agent", "citation-click": "点击引用", feedback: "提交反馈", ack: "确认收到", attempt: "问答开始", success: "回答完成", fail: "问答失败",
};
const ATTEMPTS: Record<string, string> = {
  pending: "待生成", running: "生成中", generated: "已生成", failed: "生成失败", cancelled: "已取消", fallback: "规则兜底", unknown: "结果待核对",
};

const usage = (run: ConversationLogRun) => `输入 ${run.tokensIn ?? "未知"} / 输出 ${run.tokensOut ?? "未知"}`;

function interactionSummary(event: ConversationLogDetail["interactions"][number]): string {
  const p = event.props;
  if (event.event === "member-switch") {
    const m = p?.member;
    if (m && typeof m === "object" && !Array.isArray(m) && "name" in m && typeof m.name === "string" && "revision" in m && typeof m.revision === "number") {
      return `已切换至 ${m.name} · v${m.revision}`;
    }
    return "已切换成员";
  }
  if (!p) return "没有事件属性记录";
  return (typeof p.targetSlug === "string" ? p.targetSlug : typeof p.feedback === "string" ? p.feedback : null) ?? "已记录白名单事件";
}

export function ConversationLogDetailPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const query = useConversationLogDetail(id);
  const back = new URLSearchParams(params);
  back.set("tab", "visitors");
  back.delete("cursor");

  return (
    <>
      <Link className="back-link" to={{ pathname: R.records, search: `?${back}` }}><ArrowLeft size={16} aria-hidden="true" />返回访客对话</Link>
      {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} retry={query.refetch} /> : query.data ? (
        <ConversationDetail detail={query.data} />
      ) : <EmptyState title="这段会话不可用">会话可能已删除、已过期或从未记录。</EmptyState>}
    </>
  );
}

function ConversationDetail({ detail }: { detail: ConversationLogDetail }) {
  const placementLabel = findPlacement(detail.placementKey)?.label ?? detail.placementKey;
  const scopeLabel = detail.placementKey === HOME_XIAOYING_PLACEMENT && detail.contentSlug === PUBLIC_SITE_SCOPE ? "全站公开内容" : detail.contentSlug;
  return (
    <>
      <PageHeading title={`访客对话 · ${scopeLabel}`} description={`${placementLabel} · 开始 ${timeLabel(detail.createdAt)} · 最近活动 ${timeLabel(detail.lastActivityAt)}`} />
      <div className="notice"><MessageSquareText size={16} aria-hidden="true" /><span>显示仍在保留期内的已登记正文；Token 的“未知”表示无可靠记录，0 表示明确为 0。</span></div>
      <ConversationActionPanel key={detail.conversationId} conversationId={detail.conversationId} />
      {detail.turns.length === 0 ? <EmptyState title="没有问答轮次">当前会话未记录消息正文。</EmptyState> : detail.turns.map((turn) => (
        <section className="panel conversation-turn" key={turn.id}>
          <header className="panel-heading"><h2>第 {turn.seq} 轮</h2><span className="muted">{timeLabel(turn.createdAt)}</span></header>
          <div className="conversation-messages">
            {turn.messages.length === 0 ? <p className="muted">这一轮没有消息记录。</p> : turn.messages.map((m) => (
              <article className={`conversation-message ${m.role}`} key={m.id}>
                <div className="conversation-message-heading">
                  <strong>{m.role === "visitor" ? "访客问题" : "对外回答"}</strong>
                  <span className="muted">{timeLabel(m.createdAt)} · {DELIVERY[m.delivery] ?? "送达未知"}</span>
                </div>
                {m.role === "visitor" ? <pre>{m.body}</pre> : <div className="conversation-message-markdown"><MarkdownPreview raw={m.body} /></div>}
                {m.citations ? (
                  <div className="conversation-citations">
                    <span>引用：</span>
                    {m.citations.length ? m.citations.map((slug) => <Link key={slug} to={R.contentDetail(slug)}>{slug}</Link>) : <span className="muted">没有引用</span>}
                  </div>
                ) : null}
                {m.degradeReason ? <p className="muted">降级原因：{m.degradeReason}</p> : null}
              </article>
            ))}
          </div>
          {turn.attempts.map((a) => (
            <section className="conversation-attempt" key={a.id}>
              <div className="conversation-message-heading">
                <strong><Bot size={15} aria-hidden="true" /> {a.agent ? `${a.agent.agentName} · v${a.agent.revision}` : "Agent / 修订未知"}</strong>
                <span className="muted">{ATTEMPTS[a.state] ?? "尝试状态未知"} · {timeLabel(a.createdAt)}</span>
              </div>
              {a.run ? (
                <>
                  <div className="conversation-run-meta">
                    <span>运行 {statusLabel(a.run.state)}</span>
                    <span><Clock3 size={13} aria-hidden="true" />{a.run.elapsedMs === null ? "耗时未知" : `${a.run.elapsedMs} 毫秒`}</span>
                    <span>{usage(a.run)}</span>
                    {a.run.stopReason ? <span>原因：{a.run.stopReason}</span> : null}
                  </div>
                  {a.run.events.filter((e) => e.kind === "text" && e.text).map((e) => (
                    <pre className="conversation-run-output" key={`${a.run!.id}:${e.seq}`}>{e.text}</pre>
                  ))}
                </>
              ) : <p className="muted">没有关联的运行记录；规则降级或运行信息未知。</p>}
            </section>
          ))}
        </section>
      ))}
      <section className="panel conversation-interactions">
        <header className="panel-heading"><h2>交互与反馈</h2><span className="muted">{detail.interactions.length} 条</span></header>
        {detail.interactions.length ? (
          <div className="conversation-event-list">
            {detail.interactions.map((e) => (
              <article key={e.id}>
                <strong>{EVENTS[e.event] ?? e.event}</strong> <span>{interactionSummary(e)}</span>
                {e.failCode ? <span className="badge">{e.failCode}</span> : null} <time>{timeLabel(e.at)}</time>
              </article>
            ))}
          </div>
        ) : <p className="muted conversation-empty-events">没有交互事件记录。</p>}
      </section>
    </>
  );
}
