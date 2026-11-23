import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { requestJson } from "../../api/http";
import { ADMIN_ROUTES } from "../../shared/routes";

type AgentModelConfig = {
  agentId: string; homeDir: string; providerId: string | null; modelId: string | null; modelName: string | null;
  baseURL: string | null; protocol: string | null; providerFromAgent: boolean; modelFromAgent: boolean;
  apiKeyRef: string | null; credentialScope: "agent" | "shared" | "none"; hasCredential: boolean; hasOwnCredential: boolean; knownProviders: string[];
};

export function AgentModelConfigPanel({ agentId }: { agentId: string }) {
  const query = useQuery({
    queryKey: ["agent-model-config", agentId],
    queryFn: ({ signal }) => requestJson<AgentModelConfig>(`/ops/agents/${encodeURIComponent(agentId)}/model-config`, { signal }),
  });
  if (query.isPending) return <section className="panel"><p className="muted">正在读取模型与凭据…</p></section>;
  if (query.isError) return <section className="panel"><p role="alert">模型与凭据读取失败：{query.error instanceof Error ? query.error.message : "未知错误"}</p></section>;
  if (!query.data) return null;
  return <ConfigForm key={JSON.stringify(query.data)} config={query.data} onSaved={() => void query.refetch()} />;
}

function ConfigForm({ config, onSaved }: { config: AgentModelConfig; onSaved: () => void }) {
  const [providerId, setProvider] = useState(config.providerFromAgent ? config.providerId ?? "" : "");
  const [modelId, setModelId] = useState(config.modelFromAgent ? config.modelId ?? "" : "");
  const [modelName, setModelName] = useState(config.modelFromAgent ? config.modelName ?? "" : "");
  const [apiKey, setApiKey] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const dirty = () => { setNotice(""); setError(""); };

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true); dirty();
    try {
      await requestJson<AgentModelConfig>(`/ops/agents/${encodeURIComponent(config.agentId)}/model-config`, {
        method: "PUT",
        body: { providerId: providerId || null, ...(providerId ? { modelId, modelName } : {}), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) },
      });
      setNotice(apiKey.trim() ? "已保存，并写入该 Agent 自己的 Key。" : "已保存。");
      setApiKey("");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setPending(false);
    }
  }

  const scopeText = { agent: "本 Agent 专用", shared: "沿用全局凭据", none: "没有可用凭据" }[config.credentialScope];

  return (
    <section className="panel stack">
      <h2>模型与凭据</h2>
      <form className="agent-editor" onSubmit={(e) => void save(e)}>
        <fieldset disabled={pending}>
          <label>
            模型供应商
            <select value={providerId} onChange={(e) => { setProvider(e.target.value); dirty(); }}>
              <option value="">系统默认（{config.providerId ?? "未配置"}）</option>
              {config.knownProviders.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          <label>
            {providerId ? "模型 ID（必填）" : "模型 ID（沿用系统默认）"}
            <input required={Boolean(providerId)} disabled={!providerId} maxLength={200} value={modelId} onChange={(e) => { setModelId(e.target.value); dirty(); }} placeholder={providerId ? "填写模型 ID" : `系统默认：${config.modelId ?? "未配置"}`} />
          </label>
          <label>
            模型名称（选填）
            <input maxLength={200} disabled={!providerId} placeholder={providerId ? "留空则显示模型 ID" : "系统默认"} value={modelName} onChange={(e) => { setModelName(e.target.value); dirty(); }} />
          </label>
          <label>
            API Key（留空表示不改动）
            <input type="password" autoComplete="off" value={apiKey} onChange={(e) => { setApiKey(e.target.value); dirty(); }} placeholder={config.hasOwnCredential ? "已单独配置；留空不修改" : "填了仅给此 Agent 用"} />
          </label>
          <p className="muted" style={{ margin: 0 }}>
            {config.baseURL ?? "无 API 地址"} · {config.protocol ?? "未知"} · {config.modelId ?? "未配置"} · {scopeText}（{config.hasCredential ? "有凭据" : "无凭据"}）· <Link to={ADMIN_ROUTES.settings}>修改提供方</Link>
          </p>
          {notice ? <p role="status" style={{ margin: 0 }}>{notice}</p> : null}
          {error ? <p className="error-text" role="alert" style={{ margin: 0 }}>{error}</p> : null}
          <span className="button-row">
            <button className="primary" type="submit" disabled={pending}>{pending ? "正在保存…" : "保存"}</button>
          </span>
        </fieldset>
      </form>
    </section>
  );
}
