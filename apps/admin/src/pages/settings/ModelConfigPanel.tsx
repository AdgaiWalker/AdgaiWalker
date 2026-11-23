import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { REQUEST_TIMEOUTS, requestJson } from "../../api/http";

type ModelEntry = { id: string; name: string };
type ModelPreset = { id: string; name: string; protocol: string; contextWindow?: number; note?: string };
type ProtocolInfo = { id: string; label: string; family: string };
type Provider = {
  id: string;
  label: string;
  interfaceName: string;
  protocol: string;
  baseURL: string;
  apiKeyRef: string;
  hasCredential: boolean;
  isDefault: boolean;
  models: ModelEntry[];
};
type ModelConfig = {
  providers: Provider[];
  presetsByProvider: { providerId: string; presets: ModelPreset[] }[];
  protocols: ProtocolInfo[];
};
type TestResult = { ok: boolean; latencyMs: number; model: string; error: string | null };

function ProviderForm({ provider, presets, protocols, onSaved }: { provider: Provider; presets: ModelPreset[]; protocols: ProtocolInfo[]; onSaved: () => void }) {
  const [baseURL, setBaseURL] = useState(provider.baseURL);
  const [protocol, setProtocol] = useState(provider.protocol);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<ModelEntry[]>(provider.models);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  const dirty = () => { setNotice(""); setError(""); setTest(null); };

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true); setNotice(""); setError("");
    try {
      await requestJson<ModelConfig>("/ops/model-config", {
        method: "PUT",
        body: { providerId: provider.id, baseURL, protocol, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), models },
      });
      setNotice("已保存。" + (apiKey.trim() ? " Key 已更新。" : ""));
      setApiKey("");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setPending(false);
    }
  }

  async function runTest() {
    setTesting(true); setTest(null); setError("");
    try {
      setTest(await requestJson<TestResult>("/ops/model-config/test", { method: "POST", body: { providerId: provider.id }, timeoutMs: REQUEST_TIMEOUTS.longTask }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "测试失败");
    } finally {
      setTesting(false);
    }
  }

  return (
    <form className="agent-editor" onSubmit={(e) => void save(e)}>
      <fieldset disabled={pending}>
        <label>提供方接口<input value={`${provider.label}（${provider.id} · ${provider.interfaceName}）`} readOnly /></label>
        <label>
          协议
          <select value={protocol} onChange={(e) => { setProtocol(e.target.value); dirty(); }}>
            {protocols.map((p) => <option key={p.id} value={p.id}>{p.label}{p.id === provider.protocol ? "（默认）" : ""}</option>)}
          </select>
        </label>
        <label>API 网址<input required value={baseURL} onChange={(e) => { setBaseURL(e.target.value); dirty(); }} /></label>
        <label>
          API Key
          <input type="password" autoComplete="off" placeholder={provider.hasCredential ? "已配置；留空不修改" : "尚未配置，请填入"} value={apiKey} onChange={(e) => { setApiKey(e.target.value); dirty(); }} />
        </label>
        <label>
          模型列表
          {models.map((m, i) => (
            <span key={i} className="button-row" style={{ marginTop: 4 }}>
              <input aria-label={`模型 ${i + 1} id`} placeholder="模型 id" value={m.id} onChange={(e) => { const next = [...models]; next[i] = { ...m, id: e.target.value }; setModels(next); dirty(); }} />
              <input aria-label={`模型 ${i + 1} 名称`} placeholder="显示名" value={m.name} onChange={(e) => { const next = [...models]; next[i] = { ...m, name: e.target.value }; setModels(next); dirty(); }} />
              <button type="button" onClick={() => { setModels(models.filter((_, idx) => idx !== i)); dirty(); }}>删除</button>
            </span>
          ))}
          <span className="button-row" style={{ marginTop: 6 }}>
            <button type="button" onClick={() => { setModels([...models, { id: "", name: "" }]); dirty(); }}>添加模型</button>
            {presets.filter((p) => !models.some((m) => m.id === p.id)).map((p) => (
              <button key={p.id} type="button" title={p.note} onClick={() => { setModels([...models, { id: p.id, name: p.name }]); dirty(); }}>+ {p.name}</button>
            ))}
          </span>
        </label>
        <p className="muted" style={{ margin: 0 }}>
          协议 {protocol} · 凭据 {provider.apiKeyRef}（{provider.hasCredential ? "已配置" : "未配置"}）{provider.isDefault ? " · 默认" : ""}
        </p>
        {notice ? <p role="status" style={{ margin: 0 }}>{notice}</p> : null}
        {error ? <p className="error-text" role="alert" style={{ margin: 0 }}>{error}</p> : null}
        {test ? <p role={test.ok ? "status" : "alert"} style={{ margin: 0 }}>{test.ok ? `连接正常（${test.latencyMs}ms，${test.model}）` : `连接失败：${test.error ?? "未知原因"}`}</p> : null}
        <span className="button-row">
          <button className="primary" type="submit" disabled={pending}>{pending ? "正在保存…" : "保存配置"}</button>
          <button type="button" onClick={() => void runTest()} disabled={testing || pending}>{testing ? "正在测试…" : "测试连接"}</button>
        </span>
      </fieldset>
    </form>
  );
}

export function ModelConfigPanel() {
  const query = useQuery({ queryKey: ["model-config"], queryFn: ({ signal }) => requestJson<ModelConfig>("/ops/model-config", { signal }) });
  const [selected, setSelected] = useState("");
  if (query.isPending) return <p className="muted">正在读取模型连接配置…</p>;
  if (query.isError) return <p role="alert">模型连接配置读取失败：{query.error instanceof Error ? query.error.message : "未知错误"}</p>;
  const config = query.data;
  if (!config) return null;
  const current = config.providers.find((p) => p.id === selected) ?? config.providers[0];
  return (
    <div className="stack">
      {config.providers.length > 1 ? (
        <label className="field-col">
          提供方
          <select value={current?.id ?? ""} onChange={(e) => setSelected(e.target.value)}>
            {config.providers.map((p) => <option key={p.id} value={p.id}>{p.id}{p.isDefault ? "（默认）" : ""}{p.hasCredential ? "" : " · 未配凭据"}</option>)}
          </select>
        </label>
      ) : null}
      {current ? (
        <ProviderForm
          key={current.id}
          provider={current}
          presets={config.presetsByProvider.find((i) => i.providerId === current.id)?.presets ?? []}
          protocols={config.protocols}
          onSaved={() => void query.refetch()}
        />
      ) : (
        <p role="alert">没有可配置的提供方接口。</p>
      )}
    </div>
  );
}
