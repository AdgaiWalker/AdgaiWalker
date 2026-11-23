import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { grantRemaining, pickUsableGrant, type AuthorizationGrantState, type ExecutionRunView } from "@walker/shared";
import { openEventStream, requestJson } from "../../api/http";
import { readExecutionStream } from "../../api/execution-stream";
import { useExecutionEvents, useExecutionRun } from "../../api/queries";
import { trackAdminUiEvent } from "../../api/telemetry";
import { MarkdownPreview } from "../../components/MarkdownPreview";
import { statusLabel } from "../../shared/labels";

const ACTIVE = ["QUEUED", "CLAIMED", "RUNNING", "STOPPING"];
const PROMPTS = [
  ["site", "站点核心定位", "向小影询问站点的设计原则与文章库边界"],
  ["articles", "测试文章检索", "询问最近更新的文章和版本演进"],
  ["graph", "测试图谱邻居", "要求读取知识图谱节点和邻居引用"],
] as const;

export function TrialPanel({ agentId, revisionId }: { agentId: string; revisionId: string }) {
  const [params, setParams] = useSearchParams();
  const runId = params.get("run") ?? "";
  const client = useQueryClient();
  const detail = useExecutionRun(runId);
  const events = useExecutionEvents(runId);
  const grants = useQuery({
    queryKey: ["agent-grants", agentId],
    queryFn: ({ signal }) => requestJson<AuthorizationGrantState[]>(`/ops/agents/${encodeURIComponent(agentId)}/grants`, { signal }),
  });

  const available = pickUsableGrant(grants.data ?? [], {
    origin: "admin", principalType: "owner", principalId: "owner", agentId, action: "agent:run", resourceKind: "agent", resourceId: agentId, now: Date.now(),
  });
  const [input, setInput] = useState("");
  const [live, setLive] = useState("");
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);
  const [pending, setPending] = useState(false);

  const saved = events.data?.items.filter((e) => e.kind === "text").map((e) => e.text ?? "").join("") ?? "";
  const text = live || saved;
  const state = detail.data?.state;
  const isRunning = Boolean(state && ACTIVE.includes(state));

  useEffect(() => {
    if (!runId || !state || !ACTIVE.includes(state)) return;
    const controller = new AbortController();
    void openEventStream(`/ops/execution-runs/${encodeURIComponent(runId)}/stream`, controller.signal)
      .then((body) => readExecutionStream(body, setLive))
      .then((res) => { if ("error" in res) setError(res.error); })
      .catch((err: unknown) => {
        if (!(err instanceof DOMException)) {
          const msg = err instanceof Error ? err.message : "观察中断";
          setError(msg);
          trackAdminUiEvent("ai.silent_degraded", { feature: "agent-trial-stream", reason: msg });
        }
      })
      .finally(() => { void detail.refetch(); void events.refetch(); });
    return () => controller.abort();
  }, [runId, state]);

  async function submit() {
    if (!input.trim() || pending || isRunning) return;
    setPending(true); setError(""); setLive("");
    try {
      const grant = available ?? (await requestJson<AuthorizationGrantState>("/ops/grants", {
        method: "POST",
        body: {
          requestKey: "trial" + crypto.randomUUID().replace(/-/g, "").slice(0, 12),
          level: "L0", agentId, actions: ["agent:run"], resourceScope: { kind: "agent", ids: [agentId] },
          expiresAt: new Date(Date.now() + 3600_000).toISOString(), runLimit: 1, usageLimit: 1000,
        },
      }));
      const run = await requestJson<ExecutionRunView>("/ops/execution-runs", {
        method: "POST",
        body: { idempotencyKey: "run" + crypto.randomUUID().replace(/-/g, "").slice(0, 16), kind: "chat", agentRevisionId: revisionId, input, grantId: grant.id },
      });
      setParams({ run: run.id });
      await grants.refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "试跑没有开始";
      setError(msg);
      trackAdminUiEvent("ai.silent_degraded", { feature: "agent-trial", reason: msg });
    } finally {
      setPending(false);
    }
  }

  async function stop() {
    if (!runId) return;
    setStopping(true); setError("");
    try {
      const stopped = await requestJson<ExecutionRunView>(`/ops/execution-runs/${encodeURIComponent(runId)}/stop`, { method: "POST", body: {} });
      client.setQueryData(["execution-run", runId], stopped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "停止没有确认");
    } finally {
      setStopping(false);
    }
  }

  return (
    <section className="panel stack">
      <div className="panel-heading" style={{ marginBottom: 0 }}>
        <h2>试跑</h2>
        {available ? <span className="muted">可用次数：{String(grantRemaining(available).runs ?? 0)}</span> : null}
      </div>
      <div className="chip-row">
        {PROMPTS.map(([k, label, q]) => <button key={k} type="button" className="chip" onClick={() => setInput(q)}>{label}</button>)}
      </div>
      <textarea
        rows={3}
        value={input}
        disabled={pending}
        placeholder="输入试跑问题…（Enter 提交，Shift+Enter 换行）"
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
      />
      {error ? <p className="error-text" role="alert" style={{ margin: 0 }}>{error}</p> : null}
      <div className="action-row">
        <button type="button" className="btn btn-primary" disabled={pending || !input.trim() || isRunning} onClick={() => void submit()}>
          {pending ? "提交中…" : available ? "试跑" : "签发授权并试跑"}
        </button>
        {isRunning ? <button type="button" className="btn" disabled={stopping} onClick={() => void stop()}>{stopping ? "停止中…" : "停止"}</button> : null}
      </div>
      {state ? <div className="notice" style={{ marginBottom: 0 }}>{statusLabel(state)}{detail.data?.stopReason ? ` · ${detail.data.stopReason}` : ""}{detail.data?.elapsedMs != null ? ` · ${detail.data.elapsedMs}ms` : ""}</div> : null}
      {runId ? <div className="panel" style={{ marginBottom: 0 }}>{text ? <MarkdownPreview raw={text} /> : <p className="muted">{isRunning ? "正在生成…" : "没有输出记录"}</p>}</div> : null}
    </section>
  );
}
