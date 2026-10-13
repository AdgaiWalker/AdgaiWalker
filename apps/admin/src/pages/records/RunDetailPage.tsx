import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { ExecutionRunView } from "@walker/shared";
import { useExecutionEvents, useExecutionRun } from "../../api/queries";
import { requestJson } from "../../api/http";
import { ErrorState, LoadingState, PageHeading } from "../../components/States";
import { ADMIN_ROUTES as R } from "../../shared/routes";
import { statusLabel, timeLabel } from "../../shared/labels";

/** 运行中的状态（沿用原 RunListPage 的口径） */
const ACTIVE = ["QUEUED", "CLAIMED", "RUNNING", "STOPPING"];

/**
 * 运行详情页（从 RunListPage 拆出，2026-10-12 运营记录合并成活动流后保留）。
 * 活动流的「运行」行点进来就是这里；输入/结果/用量照旧只读直读。
 */
export function RunDetailPage() {
  const { id = "" } = useParams();
  const query = useExecutionRun(id);
  const events = useExecutionEvents(id);
  const client = useQueryClient();
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState("");
  const item = query.data;
  const text =
    events.data?.items
      .filter((event) => event.kind === "text")
      .map((event) => event.text ?? "")
      .join("") ?? "";
  const first = events.data?.items.find((event) => event.kind === "text");
  const firstToken = item && first ? Date.parse(first.createdAt) - Date.parse(item.createdAt) : null;

  async function stop() {
    setStopping(true);
    setStopError("");
    try {
      const stopped = await requestJson<ExecutionRunView>(
        "/ops/execution-runs/" + encodeURIComponent(id) + "/stop",
        { method: "POST", body: {} },
      );
      client.setQueryData(["execution-run", id], stopped);
    } catch (error) {
      setStopError(error instanceof Error ? error.message : "停止没有确认");
    } finally {
      setStopping(false);
    }
  }

  return (
    <>
      <Link className="back-link" to={R.records}>
        返回运营记录
      </Link>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : (
        item && (
          <>
            <PageHeading
              title={statusLabel(item.state)}
              description={timeLabel(item.createdAt) + " · 修订 " + (item.agentRevisionId ?? "未知")}
            />
            <div className="notice">
              首字：{firstToken !== null && firstToken >= 0 ? firstToken + " 毫秒" : "尚未到达"}
              {" · "}耗时：{item.elapsedMs === null ? "未知" : item.elapsedMs + " 毫秒"}
              {" · "}
              用量：
              {item.tokensIn === null || item.tokensOut === null
                ? "未知"
                : "输入 " + item.tokensIn + " / 输出 " + item.tokensOut}
              {" · "}引用：没有记录
              {item.stopReason ? " · 原因：" + item.stopReason : ""}
            </div>
            {stopError && <p role="alert">{stopError}</p>}
            {ACTIVE.includes(item.state) && (
              <button className="primary" disabled={stopping} onClick={() => void stop()}>
                {stopping ? "正在确认停止" : "停止"}
              </button>
            )}
            <section className="panel text-panel">
              <h2>输入</h2>
              <pre>{item.input || "无输入记录"}</pre>
              <h2>结果</h2>
              <pre>{text || (ACTIVE.includes(item.state) ? "还没有文本" : "无输出记录")}</pre>
            </section>
          </>
        )
      )}
    </>
  );
}
