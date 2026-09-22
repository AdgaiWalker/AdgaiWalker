import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAgents, useExecutionEvents, useExecutionRun, useExecutionRuns } from "../../api/queries";
import { requestJson } from "../../api/http";
import { EmptyState, ErrorState, LoadingState, PageHeading } from "../../components/States";
import { RunTable } from "../../components/RunTable";
import { ADMIN_ROUTES as R } from "../../shared/routes";
import { statusLabel, timeLabel } from "../../shared/labels";
import type { ExecutionRunView } from "@walker/shared";

const ACTIVE = ["QUEUED", "CLAIMED", "RUNNING", "STOPPING"];

export function RunListPage() {
  const [params, setParams] = useSearchParams();
  const agentId = params.get("agentId") ?? "";
  const cursor = params.get("cursor") ?? "";
  const query = useExecutionRuns(agentId, cursor);
  const agents = useAgents();
  const [tab, setTab] = useState("runs");
  function filter(id: string, nextCursor = "") {
    const next = new URLSearchParams();
    if (id) next.set("agentId", id);
    if (nextCursor) next.set("cursor", nextCursor);
    setParams(next);
  }
  return (
    <>
      <PageHeading title="运营记录" description="回看实际执行记录。没有写下来的用量和引用保持未知。" />
      <div className="tabs">
        {[["runs", "运行记录"], ["visitors", "访客对话"], ["grants", "授权记录"], ["reminders", "更新提醒"]].map(([key, label]) => (
          <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {tab !== "runs" ? (
        <section className="panel"><EmptyState title="尚未接入">这类记录会在对应能力完成后开放。目前没有可查询的数据源。</EmptyState></section>
      ) : (
        <section className="panel">
          <div className="toolbar">
            <label>Agent{" "}
              <select aria-label="筛选 Agent" value={agentId} onChange={(event) => filter(event.target.value)}>
                <option value="">全部 Agent</option>
                {agents.data?.data.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>
            </label>
            <span className="muted">共 {query.data?.total ?? "未知"} 条</span>
          </div>
          {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} retry={query.refetch} /> : query.data?.items.length ? <RunTable items={query.data.items} /> : <EmptyState title="暂无运行记录">这个范围内还没有后台试跑。</EmptyState>}
          <div className="pagination">
            <button disabled={!cursor} onClick={() => filter(agentId)}>回到开头</button>
            <button disabled={!query.data?.next} onClick={() => query.data?.next && filter(agentId, query.data.next)}>下一页</button>
          </div>
        </section>
      )}
    </>
  );
}

export function RunDetailPage() {
  const { id = "" } = useParams();
  const query = useExecutionRun(id);
  const events = useExecutionEvents(id);
  const client = useQueryClient();
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState("");
  const item = query.data;
  const text = events.data?.items.filter((event) => event.kind === "text").map((event) => event.text ?? "").join("") ?? "";
  const first = events.data?.items.find((event) => event.kind === "text");
  const firstToken = item && first ? Date.parse(first.createdAt) - Date.parse(item.createdAt) : null;
  async function stop() {
    setStopping(true);
    setStopError("");
    try {
      const stopped = await requestJson<ExecutionRunView>("/ops/execution-runs/" + encodeURIComponent(id) + "/stop", { method: "POST", body: {} });
      client.setQueryData(["execution-run", id], stopped);
    } catch (error) {
      setStopError(error instanceof Error ? error.message : "停止没有确认");
    } finally {
      setStopping(false);
    }
  }
  return (
    <>
      <Link className="back-link" to={R.records}>返回运营记录</Link>
      {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} retry={query.refetch} /> : item && (
        <>
          <PageHeading title={statusLabel(item.state)} description={timeLabel(item.createdAt) + " · 修订 " + (item.agentRevisionId ?? "未知")} />
          <div className="notice">
            首字：{firstToken !== null && firstToken >= 0 ? firstToken + " 毫秒" : "尚未到达"}
            {" · "}耗时：{item.elapsedMs === null ? "未知" : item.elapsedMs + " 毫秒"}
            {" · "}用量：{item.tokensIn === null || item.tokensOut === null ? "未知" : "输入 " + item.tokensIn + " / 输出 " + item.tokensOut}
            {" · "}引用：没有记录
            {item.stopReason ? " · 原因：" + item.stopReason : ""}
          </div>
          {stopError && <p role="alert">{stopError}</p>}
          {ACTIVE.includes(item.state) && <button className="primary" disabled={stopping} onClick={() => void stop()}>{stopping ? "正在确认停止" : "停止"}</button>}
          <section className="panel text-panel">
            <h2>输入</h2>
            <pre>{item.input || "无输入记录"}</pre>
            <h2>结果</h2>
            <pre>{text || (ACTIVE.includes(item.state) ? "还没有文本" : "无输出记录")}</pre>
          </section>
        </>
      )}
    </>
  );
}
