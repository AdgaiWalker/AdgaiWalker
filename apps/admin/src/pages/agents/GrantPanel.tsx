import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AuthorizationGrantView } from "@walker/shared";
import { requestJson } from "../../api/http";

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
    queryFn: ({ signal }) => requestJson<AuthorizationGrantView[]>(`/ops/agents/${encodeURIComponent(agentId)}/grants`, { signal }),
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
      <h2>授权</h2>
      <p className="muted">等级只是模板。新授权默认一次。修改和发布必须分开，不能在这里授予持续内容全权。</p>
      {query.isError ? <p role="alert">{query.error instanceof Error ? query.error.message : "授权读取失败"}</p> : null}
      {message ? <p role="alert">{message}</p> : null}
      <button onClick={() => void issue()}>签发一次运行授权</button>
      <button disabled>签发修改授权</button>
      <button disabled>签发发布授权</button>
      <button disabled>持续内容全权</button>
      <ul>
        {(query.data ?? []).map((grant) => (
          <li key={grant.id}>
            主体 {grant.principalType}/{grant.principalId} · 对象 {grant.resourceScope.kind}:{grant.resourceScope.ids.join(",")} · 动作 {grant.actions.join(",")} · 期限 {grant.expiresAt ?? "无"} · 次数 {grant.runLimit ?? "无"} · 用量 {grant.usageLimit ?? "无"} · {grant.revokedAt ? "已撤销" : "有效"}
            {!grant.revokedAt && <button onClick={() => void revoke(grant.id)}>撤销</button>}
          </li>
        ))}
        {!query.data?.length && <li>尚未签发</li>}
      </ul>
    </section>
  );
}
