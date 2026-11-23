import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AuthorizationGrantState } from "@walker/shared";
import { requestJson } from "../../api/http";
import { timeLabel } from "../../shared/labels";

export function singleRunGrant(agentId: string, requestKey: string, now = Date.now()) {
  return {
    requestKey, level: "L0" as const, agentId, actions: ["agent:run"],
    resourceScope: { kind: "agent" as const, ids: [agentId] },
    expiresAt: new Date(now + 3600_000).toISOString(), runLimit: 1, usageLimit: 1000,
  };
}

export function GrantPanel({ agentId }: { agentId: string }) {
  const query = useQuery({
    queryKey: ["grants", agentId],
    queryFn: ({ signal }) => requestJson<AuthorizationGrantState[]>(`/ops/agents/${encodeURIComponent(agentId)}/grants`, { signal }),
  });
  const [message, setMessage] = useState("");
  const runOp = async (fn: () => Promise<unknown>, fallback: string) => {
    setMessage("");
    try { await fn(); await query.refetch(); } catch (err) { setMessage(err instanceof Error ? err.message : fallback); }
  };

  return (
    <section className="panel stack">
      <h2>授权管理</h2>
      <p className="muted" style={{ margin: 0 }}>新授权默认单次运行；修改与发布分离，禁用持续内容全权。</p>
      {query.isError ? <p className="error-text" role="alert">{query.error instanceof Error ? query.error.message : "授权读取失败"}</p> : null}
      {message ? <p className="error-text" role="alert">{message}</p> : null}
      <div className="button-row">
        <button className="primary" onClick={() => void runOp(() => requestJson("/ops/grants", { method: "POST", body: singleRunGrant(agentId, `grant${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`) }), "没有签发")}>签发一次运行授权 (L0)</button>
        <button disabled title="需走内容工作区精确审批">修改授权 (L1)</button>
        <button disabled title="需走发布预检独立签署">发布授权 (L2)</button>
        <button disabled title="安全红线：禁用持续全权">持续全权</button>
      </div>
      <div className="agent-list">
        {(query.data ?? []).map((g) => {
          const lvl = g.actions.includes("content:publish") ? "L2" : g.actions.includes("content:apply") ? "L1" : "L0";
          const expired = Boolean(g.expiresAt && new Date(g.expiresAt).getTime() < Date.now());
          const revoked = Boolean(g.revokedAt);
          const runs = g.runsCharged ?? 0;
          const usable = !revoked && !expired && !(g.runLimit !== null && runs >= g.runLimit);
          return (
            <div key={g.id} className="deployment-row" style={{ opacity: usable ? 1 : 0.72 }}>
              <div className="action-row" style={{ justifyContent: "space-between" }}>
                <div className="action-row">
                  <span className={`badge ${lvl === "L2" ? "purple" : lvl === "L1" ? "blue" : ""}`}>{lvl}</span>
                  <code className="mono">{g.id}</code>
                  <span className={revoked ? "badge red" : usable ? "badge green" : "badge"}>{revoked ? "已撤销" : expired ? "已过期" : usable ? "有效" : "额度耗尽"}</span>
                </div>
                {!revoked ? <button type="button" className="btn" onClick={() => void runOp(() => requestJson(`/ops/grants/${encodeURIComponent(g.id)}/revoke`, { method: "POST", body: {} }), "没有撤销")}>撤销</button> : null}
              </div>
              <small className="muted">
                {g.principalType}/{g.principalId} · {g.resourceScope.kind}:{g.resourceScope.ids.join(",")} · 次数 {runs}/{g.runLimit ?? "∞"} · 用量 {g.usageCharged ?? 0}/{g.usageLimit ?? "∞"} · 期限 {g.expiresAt ? timeLabel(g.expiresAt) : "无"}
              </small>
            </div>
          );
        })}
        {!query.data?.length ? <p className="muted" style={{ margin: 0 }}>尚未签发任何授权</p> : null}
      </div>
    </section>
  );
}
