/**
 * Agent 级「模型与凭据」面板（站主 2026-09-23：「每个 agent 可单独配置 token/apikey；
 * 模型名称和模型 ID 可以各自填空」）。
 *
 * 语义（站主定稿）：
 * - **独立配置，可选全局**：填了自己的 Key 就用自己的；没填回落全局那把。
 * - **模型 ID 必填、名称选填**：ID 是真正发给上游的标识；名称只用于显示，留空回落 ID。
 *
 * 分层：本块自拉数据 + 自持表单状态；语义校验全在服务端，前端不复制第二套规则。
 */
import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { requestJson } from '../../api/http';
import { ADMIN_ROUTES } from '../../shared/routes';

type AgentModelConfig = {
  agentId: string;
  homeDir: string;
  providerId: string | null;
  modelId: string | null;
  modelName: string | null;
  baseURL: string | null;
  protocol: string | null;
  providerFromAgent: boolean;
  modelFromAgent: boolean;
  apiKeyRef: string | null;
  credentialScope: 'agent' | 'shared' | 'none';
  hasCredential: boolean;
  hasOwnCredential: boolean;
  knownProviders: string[];
};

export function AgentModelConfigPanel({ agentId }: { agentId: string }) {
  const query = useQuery({
    queryKey: ['agent-model-config', agentId],
    queryFn: ({ signal }) =>
      requestJson<AgentModelConfig>(`/ops/agents/${encodeURIComponent(agentId)}/model-config`, { signal }),
  });

  if (query.isPending) return <section className="panel"><p className="muted">正在读取模型与凭据…</p></section>;
  if (query.isError) {
    return (
      <section className="panel">
        <p role="alert">
          模型与凭据读取失败：{query.error instanceof Error ? query.error.message : '未知错误'}
        </p>
      </section>
    );
  }
  if (!query.data) return null;
  // key：保存后数据变化时重建表单，避免把旧值当新值
  return <ConfigForm key={JSON.stringify(query.data)} config={query.data} onSaved={() => void query.refetch()} />;
}

function ConfigForm({ config, onSaved }: { config: AgentModelConfig; onSaved: () => void }) {
  const [providerId, setProvider] = useState(config.providerFromAgent ? config.providerId ?? '' : '');
  const [modelId, setModelId] = useState(config.modelFromAgent ? config.modelId ?? '' : '');
  const [modelName, setModelName] = useState(config.modelFromAgent ? config.modelName ?? '' : '');
  const [apiKey, setApiKey] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const dirty = () => {
    setNotice('');
    setError('');
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    dirty();
    try {
      await requestJson<AgentModelConfig>(`/ops/agents/${encodeURIComponent(config.agentId)}/model-config`, {
        method: 'PUT',
        body: {
          providerId: providerId || null,
          ...(providerId ? { modelId, modelName } : {}),
          // 留空表示不改动已有 Key；不把已存的 Key 回填到界面
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        },
      });
      const updated = apiKey.trim();
      setApiKey('');
      setNotice(updated ? '已保存，并写入该 Agent 自己的 Key。' : '已保存。');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setPending(false);
    }
  }

  const scopeText = {
    agent: '本 Agent 专用',
    shared: '沿用全局凭据',
    none: '没有可用凭据',
  }[config.credentialScope];

  return (
    <section className="panel">
      <h2>模型与凭据</h2>
      <p className="muted">
        未单独指定时沿用系统默认。这里的 Key 只影响本 Agent；已保存修订的提供方和模型需通过“创建新修订”更换。
      </p>
      <form className="agent-editor" onSubmit={(event) => void save(event)}>
        <fieldset disabled={pending}>
          <label>
            模型供应商
            <select
              value={providerId}
              onChange={(e) => {
                setProvider(e.target.value);
                dirty();
              }}
            >
              <option value="">系统默认（{config.providerId ?? '未配置'}）</option>
              {config.knownProviders.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </label>

          <label>
            {providerId ? '模型 ID（必填，真正发给上游的标识）' : '模型 ID（沿用系统默认）'}
            <input
              required={Boolean(providerId)}
              disabled={!providerId}
              maxLength={200}
              value={modelId}
              onChange={(e) => {
                setModelId(e.target.value);
                dirty();
              }}
              placeholder={providerId ? '填写该提供方的模型 ID' : `系统默认：${config.modelId ?? '未配置'}`}
            />
          </label>

          <label>
            模型名称（选填，只用于显示）
            <input
              maxLength={200}
              disabled={!providerId}
              placeholder={providerId ? '留空则显示模型 ID' : '系统默认模型名称'}
              value={modelName}
              onChange={(e) => {
                setModelName(e.target.value);
                dirty();
              }}
            />
          </label>

          <label>
            API Key（留空表示不改动）
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                dirty();
              }}
              placeholder={config.hasOwnCredential ? '已单独配置；留空表示不修改' : '填了就只给这个 Agent 用'}
            />
          </label>

          <p className="muted">
            此面板连接：{config.baseURL ?? '没有可用 API 地址'} · 协议 {config.protocol ?? '未知'} · 模型 {config.modelId ?? '未配置'}
            {config.providerFromAgent ? '（本 Agent 指定提供方）' : '（系统默认提供方）'}
            {' · '}<Link to={ADMIN_ROUTES.settings}>修改提供方 API 地址</Link>
          </p>
          <p className="muted">
            凭据引用 {config.apiKeyRef ?? '（未设置）'} · {scopeText}
            {config.hasCredential ? ' · 有可用凭据' : ' · 当前无凭据'}
          </p>
          <p className="muted">
            保存位置：该 Agent 自己的目录（{config.homeDir}）；不进 Git。
          </p>

          {notice && <p role="status">{notice}</p>}
          {error && <p role="alert">{error}</p>}

          <span className="button-row">
            <button className="primary" type="submit" disabled={pending}>
              {pending ? '正在保存…' : '保存'}
            </button>
          </span>
        </fieldset>
      </form>
    </section>
  );
}
