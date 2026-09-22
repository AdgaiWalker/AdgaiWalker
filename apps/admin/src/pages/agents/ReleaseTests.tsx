import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../../api/http";

type Report = {
  configHash: string;
  results: Array<{ testCaseId: string; assertion: { verdict: "pass" | "fail" | "review"; reason: string } }>;
  gate: { ok: boolean; reason?: string };
};

const labels: Record<string, string> = {
  "normal-answer": "正常问答",
  "unknown-content": "内容未知",
  privilege: "越权请求",
  pass: "通过",
  fail: "未通过",
  review: "待核查",
};

export function ReleaseTests({ agentId, revisionId }: { agentId: string; revisionId: string }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["release-tests", agentId, revisionId],
    queryFn: ({ signal }) => requestJson<Report>(`/ops/agents/${encodeURIComponent(agentId)}/revisions/${encodeURIComponent(revisionId)}/release-tests`, { signal }),
  });
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  async function act(path: string, label: string) {
    setPending(label);
    setMessage("");
    try {
      await requestJson(path, { method: "POST", body: {} });
      setMessage("部署尚未接通");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "没有完成");
    } finally {
      setPending("");
      await query.refetch();
      await client.invalidateQueries({ queryKey: ["release-tests", agentId, revisionId] });
    }
  }
  const report = query.data;
  return (
    <section className="panel">
      <h2>发布前测试</h2>
      <p className="muted">结果只对当前配置摘要有效。权限未通过、待核查或换了配置，都不能部署。</p>
      {query.isError ? <p role="alert">{query.error instanceof Error ? query.error.message : "测试结果读取失败"}</p> : null}
      <ul>
        {report?.results.map((item) => <li key={item.testCaseId}>{labels[item.testCaseId] ?? item.testCaseId}：{labels[item.assertion.verdict]} · {item.assertion.reason}</li>)}
        {!report?.results.length && <li>尚未运行</li>}
      </ul>
      {report && <p>{report.gate.ok ? "三类测试已通过。部署本身尚未接通。" : report.gate.reason}</p>}
      {message && <p role="alert">{message}</p>}
      <button disabled={Boolean(pending)} onClick={() => void act(`/ops/agents/${encodeURIComponent(agentId)}/revisions/${encodeURIComponent(revisionId)}/release-tests`, "测试")}>{pending === "测试" ? "正在测试" : "运行三类测试"}</button>
      <button disabled={Boolean(pending)} onClick={() => void act(`/ops/agents/${encodeURIComponent(agentId)}/revisions/${encodeURIComponent(revisionId)}/deploy`, "部署")}>{pending === "部署" ? "正在确认" : "部署"}</button>
    </section>
  );
}
