import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { grantRemaining, pickUsableGrant, type AuthorizationGrantState, type ExecutionRunView } from "@walker/shared";
import { openEventStream, requestJson } from "../../api/http";
import { readExecutionStream } from "../../api/execution-stream";
import { useExecutionEvents, useExecutionRun } from "../../api/queries";
import { statusLabel } from "../../shared/labels";

const ACTIVE = ["QUEUED", "CLAIMED", "RUNNING", "STOPPING"];

/**
 * 挑一条能拿去试跑的授权——**判据与挑选顺序都在 shared**，与 `selectUsable`（服务端唯一入口）
 * 是同一个函数，绝不各写一遍。
 *
 * 这里原来自己写了一遍「未撤销 + 未过期 + 含 agent:run」，**没看剩余额度**，
 * 于是每次都挑中那条已经跑满的授权，反复提交出 stopReason=quota 的空运行，
 * 面板上只显示「没有输出记录」。
 */
function pickUsable(grants: readonly AuthorizationGrantState[], agentId: string) {
  return pickUsableGrant(grants, {
    origin: "admin", principalType: "owner", principalId: "owner",
    agentId, action: "agent:run", resourceKind: "agent", resourceId: agentId, now: Date.now(),
  });
}

/** 剩余额度只用于显示：真正拦住空跑的是上面的判据与服务端的原子预留。 */
function remainingLabel(grant: AuthorizationGrantState) {
  // 能走到这里说明 grantUsable 已经放行，而它要求 runLimit 非空——所以只可能是具体数字。
  return String(grantRemaining(grant).runs ?? 0);
}

export function TrialPanel({ agentId, revisionId }: { agentId: string; revisionId: string }) {
  const [params, setParams] = useSearchParams();
  const runId = params.get("run") ?? "";
  const client = useQueryClient();
  const detail = useExecutionRun(runId);
  const events = useExecutionEvents(runId);
  const grants = useQuery({
    queryKey: ["agent-grants", agentId],
    queryFn: ({ signal }) => requestJson<AuthorizationGrantState[]>("/ops/agents/" + encodeURIComponent(agentId) + "/grants", { signal }),
  });
  const granted = grants.data ?? [];
  const available = pickUsable(granted, agentId);
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
      const grant = available ?? await requestJson<AuthorizationGrantState>("/ops/grants", {
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
      <button className="primary" disabled={pending || !input.trim()} onClick={() => void submit()}>{pending ? "正在提交" : available ? "试跑" : "签发一次授权并试跑"}</button>
      {available && <span className="muted"> 剩余次数：{remainingLabel(available)}</span>}
      {!available && granted.length > 0 && (
        <p className="muted">名下 {granted.length} 条授权现在都不可用（用满 / 过期 / 已撤销），不会再被拿去空跑；点上面的按钮会签发一条新的。</p>
      )}
      {state && (
        <div className="notice">
          {statusLabel(state)}
          {/* 失败必须说清为什么：没有额度 / 超时 / 运行崩了，处理动作完全不同。
              只显示「失败」等于把上一轮那个「没有输出记录」的哑谜重演一遍。 */}
          {detail.data?.stopReason ? " · 原因：" + detail.data.stopReason : ""}
          {" · "}耗时：{detail.data?.elapsedMs === null || detail.data?.elapsedMs === undefined ? "未知" : detail.data.elapsedMs + " 毫秒"}
          {" · "}用量：{detail.data?.tokensIn === null || detail.data?.tokensOut === null || detail.data?.tokensIn === undefined ? "未知" : "输入 " + detail.data.tokensIn + " / 输出 " + detail.data.tokensOut}
        </div>
      )}
      {state && ACTIVE.includes(state) && <button disabled={stopping} onClick={() => void stop()}>{stopping ? "正在确认停止" : "停止"}</button>}
      {runId && (
        <label>
          输出（模型的回答）
          <pre>{text || (state && ACTIVE.includes(state) ? "正在生成…" : "没有输出记录")}</pre>
        </label>
      )}
    </section>
  );
}
