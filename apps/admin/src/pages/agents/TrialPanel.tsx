import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthorizationGrantView, ExecutionRunView } from "@walker/shared";
import { openEventStream, requestJson } from "../../api/http";
import { readExecutionStream } from "../../api/execution-stream";
import { useExecutionEvents, useExecutionRun } from "../../api/queries";
import { statusLabel } from "../../shared/labels";

const ACTIVE = ["QUEUED", "CLAIMED", "RUNNING", "STOPPING"];

function usable(grant: AuthorizationGrantView) {
  return grant.revokedAt === null && grant.actions.includes("agent:run") && grant.expiresAt !== null && Date.parse(grant.expiresAt) > Date.now();
}

export function TrialPanel({ agentId, revisionId }: { agentId: string; revisionId: string }) {
  const [params, setParams] = useSearchParams();
  const runId = params.get("run") ?? "";
  const client = useQueryClient();
  const detail = useExecutionRun(runId);
  const events = useExecutionEvents(runId);
  const grants = useQuery({
    queryKey: ["agent-grants", agentId],
    queryFn: ({ signal }) => requestJson<AuthorizationGrantView[]>("/ops/agents/" + encodeURIComponent(agentId) + "/grants", { signal }),
  });
  const [input, setInput] = useState("");
  const [live, setLive] = useState("");
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);
  const [pending, setPending] = useState(false);
  const saved = events.data?.items.filter((event) => event.kind === "text").map((event) => event.text ?? "").join("") ?? "";
  const text = live || saved;
  const state = detail.data?.state;

  useEffect(() => {
    if (!runId || !state || !ACTIVE.includes(state)) return;
    const controller = new AbortController();
    void openEventStream("/ops/execution-runs/" + encodeURIComponent(runId) + "/stream", controller.signal)
      .then((body) => readExecutionStream(body, setLive))
      .then((result) => { if ("error" in result) setError(result.error); })
      .catch((reason: unknown) => { if (!(reason instanceof DOMException)) setError(reason instanceof Error ? reason.message : "观察中断"); })
      .finally(() => { void detail.refetch(); void events.refetch(); });
    return () => controller.abort();
  }, [runId, state]);

  async function submit() {
    setPending(true);
    setError("");
    setLive("");
    try {
      const current = grants.data?.find(usable);
      const grant = current ?? await requestJson<AuthorizationGrantView>("/ops/grants", {
        method: "POST",
        body: {
          requestKey: "trial" + crypto.randomUUID().replace(/-/g, "").slice(0, 12),
          level: "L0", agentId, actions: ["agent:run"],
          resourceScope: { kind: "agent", ids: [agentId] },
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          runLimit: 1, usageLimit: 1000,
        },
      });
      const run = await requestJson<ExecutionRunView>("/ops/execution-runs", {
        method: "POST",
        body: {
          idempotencyKey: "run" + crypto.randomUUID().replace(/-/g, "").slice(0, 16),
          kind: "chat", agentRevisionId: revisionId, input, grantId: grant.id,
        },
      });
      setParams({ run: run.id });
      await grants.refetch();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "试跑没有开始");
    } finally {
      setPending(false);
    }
  }

  async function stop() {
    if (!runId) return;
    setStopping(true);
    setError("");
    try {
      const stopped = await requestJson<ExecutionRunView>("/ops/execution-runs/" + encodeURIComponent(runId) + "/stop", { method: "POST", body: {} });
      client.setQueryData(["execution-run", runId], stopped);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "停止没有确认");
    } finally {
      setStopping(false);
    }
  }

  return (
    <section className="panel agent-editor">
      <h2>试跑</h2>
      <p className="muted">使用所选修订。没有可用授权时，会签发一小时、一次调用的只读授权。刷新只恢复已保存结果，不会重新调用模型。</p>
      <label>输入<textarea required rows={4} value={input} onChange={(event) => setInput(event.target.value)} /></label>
      {error && <p role="alert">{error}</p>}
      <button className="primary" disabled={pending || !input.trim()} onClick={() => void submit()}>{pending ? "正在提交" : grants.data?.some(usable) ? "试跑" : "签发一次授权并试跑"}</button>
      {state && (
        <div className="notice">
          {statusLabel(state)}
          {" · "}耗时：{detail.data?.elapsedMs === null || detail.data?.elapsedMs === undefined ? "未知" : detail.data.elapsedMs + " 毫秒"}
          {" · "}用量：{detail.data?.tokensIn === null || detail.data?.tokensOut === null || detail.data?.tokensIn === undefined ? "未知" : "输入 " + detail.data.tokensIn + " / 输出 " + detail.data.tokensOut}
          {" · "}引用：没有记录
        </div>
      )}
      {state && ACTIVE.includes(state) && <button disabled={stopping} onClick={() => void stop()}>{stopping ? "正在确认停止" : "停止"}</button>}
      {runId && <pre>{text || "还没有文本"}</pre>}
    </section>
  );
}
