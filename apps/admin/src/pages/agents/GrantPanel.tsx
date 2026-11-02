import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AuthorizationGrantState } from "@walker/shared";
import { requestJson } from "../../api/http";
import { timeLabel } from "../../shared/labels";

export function singleRunGrant(agentId: string, requestKey: string, now = Date.now()) {
  return {
    requestKey,
    level: "L0" as const,
    agentId,
    actions: ["agent:run"],
    resourceScope: { kind: "agent" as const, ids: [agentId] },
    expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
    runLimit: 1,
    usageLimit: 1000,
  };
}

export function GrantPanel({ agentId }: { agentId: string }) {
  const query = useQuery({
    queryKey: ["grants", agentId],
    queryFn: ({ signal }) => requestJson<AuthorizationGrantState[]>(`/ops/agents/${encodeURIComponent(agentId)}/grants`, { signal }),
  });
  const [message, setMessage] = useState("");
  async function issue() {
    setMessage("");
    try {
      await requestJson("/ops/grants", { method: "POST", body: singleRunGrant(agentId, `grant${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`) });
      await query.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "没有签发");
    }
  }
  async function revoke(id: string) {
    setMessage("");
    try {
      await requestJson(`/ops/grants/${encodeURIComponent(id)}/revoke`, { method: "POST", body: {} });
      await query.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "没有撤销");
    }
  }
  return (
    <section className="panel">
      <h2>授权管理</h2>
      <p className="muted">等级只是模板。新授权默认一次。修改和发布必须分开，不能在这里授予持续内容全权。</p>
      {query.isError ? <p role="alert">{query.error instanceof Error ? query.error.message : "授权读取失败"}</p> : null}
      {message ? <p role="alert">{message}</p> : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button className="primary" onClick={() => void issue()}>签发一次运行授权 (L0)</button>
        <button disabled title="需走内容工作区精确审批">签发修改授权 (L1)</button>
        <button disabled title="需走发布预检独立签署">签发发布授权 (L2)</button>
        <button disabled title="安全红线：禁用持续全权">持续内容全权</button>
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {(query.data ?? []).map((grant) => {
          const displayLevel = grant.actions.includes("content:publish")
            ? "L2"
            : grant.actions.includes("content:apply")
            ? "L1"
            : "L0";
          const isExpired = Boolean(grant.expiresAt && new Date(grant.expiresAt).getTime() < Date.now());
          const isRevoked = Boolean(grant.revokedAt);
          const runsCharged = grant.runsCharged ?? 0;
          const usageCharged = grant.usageCharged ?? 0;
          const isExhausted = grant.runLimit !== null && runsCharged >= grant.runLimit;
          const isUsable = !isRevoked && !isExpired && !isExhausted;

          return (
            <div
              key={grant.id}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: "12px 16px",
                background: isUsable ? "var(--surface)" : "var(--surface-sunken, #f8fafc)",
                opacity: isUsable ? 1 : 0.8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`badge ${displayLevel === "L2" ? "purple" : displayLevel === "L1" ? "blue" : ""}`}>
                    {displayLevel}
                  </span>
                  <code style={{ fontWeight: 600, fontSize: 13 }}>{grant.id}</code>
                  <span
                    className={
                      isRevoked
                        ? "badge red"
                        : isExpired
                        ? "badge"
                        : isUsable
                        ? "badge green"
                        : "badge"
                    }
                  >
                    {isRevoked ? "已撤销" : isExpired ? "已过期" : isUsable ? "有效" : "额度耗尽"}
                  </span>
                </div>
                {!grant.revokedAt && (
                  <button
                    type="button"
                    className="button"
                    style={{ padding: "2px 8px", fontSize: 12 }}
                    onClick={() => void revoke(grant.id)}
                  >
                    撤销
                  </button>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                <div>主体：{grant.principalType}/{grant.principalId} · 范围：{grant.resourceScope.kind}:{grant.resourceScope.ids.join(",")} · 动作：{grant.actions.join(",")}</div>
                <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
                  <span>
                    次数：<strong>{runsCharged}</strong> / {grant.runLimit ?? "不限"}
                  </span>
                  <span>
                    用量：<strong>{usageCharged}</strong> / {grant.usageLimit ?? "不限"} tokens
                  </span>
                  <span>
                    期限：{grant.expiresAt ? timeLabel(grant.expiresAt) : "无"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {!query.data?.length && <p className="muted">尚未签发任何授权</p>}
      </div>
    </section>
  );
}
