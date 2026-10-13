/**
 * 模型连接配置（设置页）。
 *
 * 这是「配好供应商 → 建 Agent → 试跑 → 看记录 → 部署」整条闭环的第一环——
 * 此前缺失：设置页只显示能力表，并写明「配置编辑尚未接入」。
 *
 * 分层：本块自拉数据 + 自持表单状态，对外只暴露刷新回调；
 * 领域校验（网址形状、模型目录、凭据写入）全在服务端，前端不复制第二套规则。
 */
import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { REQUEST_TIMEOUTS, requestJson } from '../../api/http';

type ModelEntry = { id: string; name: string };
type ModelPreset = { id: string; name: string; protocol: string; contextWindow?: number; note?: string };
type ProtocolInfo = { id: string; label: string; family: string };
type Provider = {
  id: string;
  label: string;
  interfaceName: string;
  protocol: string;
  protocolLabel: string;
  baseURL: string;
  apiKeyRef: string;
  hasCredential: boolean;
  isDefault: boolean;
  models: ModelEntry[];
};
type ModelConfig = {
  home: string;
  credentialLocation: string;
  providers: Provider[];
  defaultProvider: string | null;
  defaultModel: string | null;
  presetsByProvider: { providerId: string; presets: ModelPreset[] }[];
  protocols: ProtocolInfo[];
};
type TestResult = { ok: boolean; latencyMs: number; model: string; error: string | null };

function ProviderForm({
  provider,
  presets,
  protocols,
  onSaved,
}: {
  provider: Provider;
  presets: ModelPreset[];
  protocols: ProtocolInfo[];
  onSaved: () => void;
}) {
  const [baseURL, setBaseURL] = useState(provider.baseURL);
  const [protocol, setProtocol] = useState(provider.protocol);
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<ModelEntry[]>(provider.models);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  /** 任何编辑都清掉上一次的成功/失败/测试提示，避免旧结论看起来像新结论。 */
  const dirty = () => {
    setNotice('');
    setError('');
    setTest(null);
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setNotice('');
    setError('');
    try {
      await requestJson<ModelConfig>('/ops/model-config', {
        method: 'PUT',
        body: {
          providerId: provider.id,
          baseURL,
          protocol,
          // 留空表示不改动已有 Key；不把已存的 Key 回填到界面
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          models,
        },
      });
      setApiKey('');
      setNotice('已保存。' + (apiKey.trim() ? ' Key 已更新。' : ''));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setPending(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTest(null);
    setError('');
    try {
      setTest(
        await requestJson<TestResult>('/ops/model-config/test', {
          method: 'POST',
          body: { providerId: provider.id },
          // 服务端会真发一次上游请求，最长等 15s（AbortSignal.timeout(15_000)）。
          // 前端必须 ≥ 它，否则上游超时时界面会在服务端仍在等的时候先谎报失败。
          timeoutMs: REQUEST_TIMEOUTS.longTask,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '测试失败');
    } finally {
      setTesting(false);
    }
  }

  return (
    <form className="agent-editor" onSubmit={(event) => void save(event)}>
      <fieldset disabled={pending}>
        <label>
          提供方接口
          <input value={provider.label + '（' + provider.id + ' · ' + provider.interfaceName + '）'} readOnly />
        </label>

        <label>
          协议
          <select
            value={protocol}
            onChange={(e) => {
              setProtocol(e.target.value);
              dirty();
            }}
          >
            {/* 目录默认协议置顶；其余按家族列出，便于接自建兼容网关 */}
            {protocols.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
                {item.id === provider.protocol ? '（目录默认）' : ''}
              </option>
            ))}
          </select>
        </label>

        <label>
          API 网址
          <input
            required
            value={baseURL}
            onChange={(e) => {
              setBaseURL(e.target.value);
              dirty();
            }}
          />
        </label>

        <label>
          API Key
          <input
            type="password"
            autoComplete="off"
            placeholder={provider.hasCredential ? '已配置；留空表示不修改' : '尚未配置，请填入'}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              dirty();
            }}
          />
        </label>

        <label>
          模型（可增删；未列出的 id 仍可直接使用，由 dsh 在请求时校验）
          {models.map((model, index) => (
            <span key={index} className="button-row" style={{ marginTop: 6 }}>
              <input
                aria-label={`模型 ${index + 1} id`}
                placeholder="模型 id"
                value={model.id}
                onChange={(e) => {
                  const next = [...models];
                  next[index] = { ...model, id: e.target.value };
                  setModels(next);
                  dirty();
                }}
              />
              <input
                aria-label={`模型 ${index + 1} 名称`}
                placeholder="显示名（可留空）"
                value={model.name}
                onChange={(e) => {
                  const next = [...models];
                  next[index] = { ...model, name: e.target.value };
                  setModels(next);
                  dirty();
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setModels(models.filter((_, i) => i !== index));
                  dirty();
                }}
              >
                删除
              </button>
            </span>
          ))}
          <span className="button-row" style={{ marginTop: 6 }}>
            <button type="button" onClick={() => { setModels([...models, { id: '', name: '' }]); dirty(); }}>
              添加模型
            </button>
            {presets
              .filter((preset) => !models.some((model) => model.id === preset.id))
              .map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  title={[
                    preset.note,
                    preset.contextWindow ? `上下文 ${preset.contextWindow.toLocaleString()} token` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  onClick={() => { setModels([...models, { id: preset.id, name: preset.name }]); dirty(); }}
                >
                  + {preset.name}
                </button>
              ))}
          </span>
        </label>

        <p className="muted">
          协议 {protocol} · 凭据引用 {provider.apiKeyRef} ·{' '}
          {provider.hasCredential ? '已配置' : '尚未配置'}
          {provider.isDefault ? ' · dsh 默认提供方' : ''}
        </p>
        <p className="muted">
          配置目录：{provider.interfaceName} 段写入 settings.yaml；Key 写入服务器凭据文件（不进 Git）。
        </p>

        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">{error}</p>}
        {test && (
          <p role={test.ok ? 'status' : 'alert'}>
            {test.ok
              ? `连接正常（${test.latencyMs}ms，模型 ${test.model}）`
              : `连接失败：${test.error ?? '未知原因'}`}
          </p>
        )}

        <span className="button-row">
          <button className="primary" type="submit" disabled={pending}>
            {pending ? '正在保存…' : '保存配置'}
          </button>
          <button type="button" onClick={() => void runTest()} disabled={testing || pending}>
            {testing ? '正在测试…' : '测试连接'}
          </button>
        </span>
      </fieldset>
    </form>
  );
}

export function ModelConfigPanel() {
  const query = useQuery({
    queryKey: ['model-config'],
    queryFn: ({ signal }) => requestJson<ModelConfig>('/ops/model-config', { signal }),
  });
  const [selected, setSelected] = useState('');

  if (query.isPending) return <p className="muted">正在读取模型连接配置…</p>;
  if (query.isError) {
    return (
      <p role="alert">
        模型连接配置读取失败：{query.error instanceof Error ? query.error.message : '未知错误'}
      </p>
    );
  }

  const config = query.data;
  if (!config) return null;
  const providers = config.providers;
  const current = providers.find((provider) => provider.id === selected) ?? providers[0];

  return (
    <>
      {providers.length > 1 && (
        <label>
          提供方
          <select value={current?.id ?? ''} onChange={(e) => setSelected(e.target.value)}>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.id}
                {provider.isDefault ? '（dsh 默认）' : ''}
                {provider.hasCredential ? '' : ' · 未配置凭据'}
              </option>
            ))}
          </select>
        </label>
      )}

      {current ? (
        // key = provider.id：切换提供方时重建表单，避免把上一个的表单值带过去
        <ProviderForm
          key={current.id}
          provider={current}
          presets={config.presetsByProvider.find((item) => item.providerId === current.id)?.presets ?? []}
          protocols={config.protocols}
          onSaved={() => void query.refetch()}
        />
      ) : (
        <p role="alert">dsh 目录里没有可配置的提供方接口。</p>
      )}
    </>
  );
}
