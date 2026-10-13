/**
 * 模型连接配置（R24 闭环的第一环，也是此前唯一缺的一环）。
 *
 * 之前后台只有一张只读能力表，设置页明说「配置编辑尚未接入」——
 * 于是「配好供应商 → 建 Agent → 试跑 → 看记录 → 部署」这条链在第一环就断了。
 *
 * 本服务做三件事：
 * 1. 读：当前提供方、API 网址、凭据是否已配、模型列表（**绝不返回值**）；
 * 2. 写：网址与模型进 settings.yaml 的接口段，Key 进凭据存储（不进 Git）；
 * 3. 测：真发一次最小请求验证连通，失败如实带回上游片段，不假装成功。
 */
import { Inject, Injectable } from '@nestjs/common';
import path from 'node:path';
import {
  buildAgentModelCatalog,
  findWireProtocol,
  KNOWN_PROVIDER_INTERFACES,
  modelPresetsFor,
  WIRE_PROTOCOLS,
  type ModelDirectoryProvider,
  type ModelPreset,
  type WireProtocol,
  type WireProtocolInfo,
} from '@walker/shared';

/** 承载多条提供方路由、且能在路由上改写协议的那个适配器段名。 */
const PI_AI_SECTION = 'llm-pi-ai';

/** 提供方的界面显示名；未登记的路由回落为路由 id。 */
function knownLabel(route: string): string {
  return KNOWN_PROVIDER_INTERFACES.find((item) => item.route === route)?.label ?? route;
}
import { MODEL_DIRECTORY, type ModelDirectoryPort } from '../ports/model-directory.port';
import { MODEL_CREDENTIAL, type ModelCredentialPort } from '../ports/model-credential.port';
import { validationError } from '../common/http-error';
import { mergeSettingsProviderRoute, mergeSettingsSection, readSettingsObject } from '../runtime/dsh-settings-file';

export interface ModelConfigProviderView {
  id: string;
  /** 提供方显示名。 */
  label: string;
  interfaceName: string;
  /** 线协议与可读名（OpenAI / Anthropic / …）。 */
  protocol: string;
  protocolLabel: string;
  baseURL: string;
  apiKeyRef: string;
  hasCredential: boolean;
  isDefault: boolean;
  models: { id: string; name: string }[];
}

export interface ModelConfigView {
  /** 配置根目录（排错用）。 */
  home: string;
  /** 凭据文件位置（非密钥，便于站主自己核对）。 */
  credentialLocation: string;
  providers: ModelConfigProviderView[];
  defaultProvider: string | null;
  defaultModel: string | null;
  /** 各提供方的预置模型（每厂商 3 个代表作），供界面「快速添加」。 */
  presetsByProvider: readonly { providerId: string; presets: readonly ModelPreset[] }[];
  /** 全部线协议，供界面如实标注与选择。 */
  protocols: readonly WireProtocolInfo[];
}

export interface ModelConfigSaveInput {
  providerId: string;
  baseURL: string;
  /** 有值才更新凭据；不传/空串表示保持原值不变。 */
  apiKey?: string | null;
  models?: { id: string; name: string }[];
  /** 线协议；不传则沿用该提供方的目录默认。 */
  protocol?: string;
}

export interface ModelConfigTestResult {
  ok: boolean;
  latencyMs: number;
  model: string;
  error: string | null;
}

/** 网址必须是 http(s) 绝对地址，且不带查询串（避免把参数拼进端点）。 */
function validBaseURL(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.search || url.hash) return null;
    return trimmed.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** 模型目录：只接受有非空 id 的条目，名称缺省回落到 id，去重。 */
function parseModels(value: unknown): { id: string; name: string }[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: { id: string; name: string }[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (!id || id.length > 200 || seen.has(id)) continue;
    seen.add(id);
    const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : id;
    out.push({ id, name });
  }
  return out;
}

@Injectable()
export class ModelConfigService {
  constructor(
    @Inject(MODEL_DIRECTORY) private readonly directory: ModelDirectoryPort,
    @Inject(MODEL_CREDENTIAL) private readonly credentials: ModelCredentialPort,
  ) {}

  /** 当前配置：提供方 + 协议 + 凭据状态（不返回值）+ 模型列表。 */
  read(): ModelConfigView {
    const snapshot = this.directory.snapshot();
    const catalog = buildAgentModelCatalog(snapshot);
    return {
      home: this.directory.homeDir(),
      credentialLocation: this.credentials.location(),
      providers: catalog.providers.map((provider) => ({
        ...provider,
        label: knownLabel(provider.id),
        // 凭据状态以凭据存储为准（单一真相源，见 R24.b）。
        hasCredential: this.credentials.has(provider.apiKeyRef),
      })),
      defaultProvider: catalog.defaultProvider,
      defaultModel: catalog.defaultModel,
      // 预置按提供方分组返回；界面选中哪个提供方就展示它自己的 3 个代表作。
      presetsByProvider: catalog.providers.map((provider) => ({
        providerId: provider.id,
        presets: modelPresetsFor(provider.id),
      })),
      protocols: WIRE_PROTOCOLS,
    };
  }

  /**
   * 保存配置：网址与模型写 settings.yaml 的接口段；Key 写凭据存储。
   * 只允许改「已支持的接口」（目录里登记过的提供方），不接受任意段名。
   */
  save(input: ModelConfigSaveInput): ModelConfigView {
    const provider = this.directory
      .snapshot()
      .providers.find((item) => item.id === input.providerId);
    if (!provider) throw validationError('提供方不在 dsh 目录中；不能为未登记的接口写配置');

    const baseURL = validBaseURL(input.baseURL);
    if (!baseURL) throw validationError('API 网址必须是 http(s) 绝对地址，且不带查询串');

    const protocol = this.#resolveProtocol(input, provider);
    const models = input.models === undefined ? provider.models : parseModels(input.models);

    // 路径取自目录端口（与读取同源），不再自己 resolve 一次——
    // 否则写入落点与读取落点会成为两个真相源（测试也无法用临时目录接管）。
    const settingsPath = path.join(this.directory.homeDir(), 'settings.yaml');
    const section = {
      apiKeyEnv: provider.apiKeyRef,
      baseURL,
      // pi-ai 路由把请求形状写在自己的 api 字段上；写回时只在非默认协议时带上，
      // 避免给 llm-deepseek 这类单协议适配器塞它不认识的键。
      ...(protocol !== provider.protocol ? { api: protocol } : {}),
      ...(models.length ? { models } : {}),
    };

    // 两条通道的设置形状不同：
    // - llm-deepseek：路由名就是段名（settings 的 llm-deepseek 段）；
    // - llm-pi-ai：段名固定 llm-pi-ai，各路由挂在它下面的 providers.<route>。
    if (provider.interfaceName === 'llm-pi-ai') {
      mergeSettingsProviderRoute(settingsPath, provider.id, section);
    } else {
      mergeSettingsSection(settingsPath, provider.interfaceName, section);
    }

    // 默认模型只在**该提供方真的可用**时才改写。
    //
    // 曾经的缺陷：这里无条件把刚保存的提供方设成全局默认——于是「给 Anthropic 填个网址」
    // 会把默认从可用的 DeepSeek 抢走，运行时随即失败。保存一家提供方的配置，
    // 不应该动别家的默认；只有它自己能跑（凭据就位）时才允许接管默认。
    const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
    if (apiKey) this.credentials.write(provider.apiKeyRef, apiKey);

    const usable = this.credentials.has(provider.apiKeyRef);
    const defaultModel = models[0]?.id;
    // 只有该提供方真的能跑（凭据就位）才写默认；无凭据的保存只落它自己的路由配置。
    if (defaultModel && usable) {
      mergeSettingsSection(settingsPath, 'agent-default-model', {
        provider: provider.id,
        model: defaultModel,
      });
    }

    return this.read();
  }

  /**
   * 校验并归一请求里的协议；未给则用目录默认。非法协议 fail-closed。
   *
   * 只有**多提供方适配器**（llm-pi-ai）能在路由上改写协议；单协议适配器
   * （llm-deepseek）只认自己那一种，硬塞别的协议等于写下一个跑不通的配置，
   * 所以直接拒绝而不是静默落盘。
   */
  #resolveProtocol(input: ModelConfigSaveInput, provider: ModelDirectoryProvider): WireProtocol {
    const raw = typeof input.protocol === 'string' ? input.protocol.trim() : '';
    const fallback = provider.protocol;
    if (!raw || raw === fallback) return fallback;
    if (!findWireProtocol(raw)) throw validationError(`未知协议「${raw}」；请从已登记的线协议中选择`);
    if (provider.interfaceName !== PI_AI_SECTION) {
      throw validationError(
        `提供方「${provider.id}」走的适配器（${provider.interfaceName}）只支持 ${fallback}；` +
          '要接别的协议请登记到 llm-pi-ai 通道',
      );
    }
    return raw as WireProtocol;
  }

  /**
   * 连通性测试：真发一次最小请求。
   * 有意不写进任何记录——Key 在请求头里，上游回执片段只用于当场排错。
   */
  async test(providerId: string): Promise<ModelConfigTestResult> {
    const snapshot = this.directory.snapshot();
    const provider = snapshot.providers.find((item) => item.id === providerId);
    if (!provider) return { ok: false, latencyMs: 0, model: '', error: '提供方不在 dsh 目录中' };

    const apiKey = this.credentials.read(provider.apiKeyRef);
    if (!apiKey) {
      return {
        ok: false,
        latencyMs: 0,
        model: '',
        error: `凭据引用 ${provider.apiKeyRef} 还没有值；请先在下方填入 API Key 并保存`,
      };
    }

    const model = provider.models[0]?.id ?? (snapshot.defaultProvider === provider.id ? snapshot.defaultModel : null) ?? '';
    if (!model) {
      return { ok: false, latencyMs: 0, model: '', error: '还没有可用的模型 id；请先添加一个模型' };
    }

    const started = Date.now();
    try {
      const base = provider.baseURL.replace(/\/+$/, '');
      let url: string;
      let headers: Record<string, string> = { 'Content-Type': 'application/json' };
      let body: Record<string, unknown>;
      if (provider.protocol === 'openai-completions') {
        url = `${base}/chat/completions`;
        headers.Authorization = `Bearer ${apiKey}`;
        body = { model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 4, stream: false };
      } else if (provider.protocol === 'openai-responses') {
        url = `${base}/responses`;
        headers.Authorization = `Bearer ${apiKey}`;
        body = { model, input: 'ping', max_output_tokens: 16 };
      } else if (provider.protocol === 'anthropic-messages') {
        url = `${base}/v1/messages`;
        headers = { ...headers, 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
        body = { model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 16 };
      } else if (provider.protocol === 'google-generative-ai') {
        url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
        headers['x-goog-api-key'] = apiKey;
        body = { contents: [{ parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 16 } };
      } else {
        return { ok: false, latencyMs: 0, model, error: `暂不支持 ${provider.protocol} 协议的直连测试；请使用 Agent 试跑验证` };
      }
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const latencyMs = Date.now() - started;
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        return {
          ok: false,
          latencyMs,
          model,
          error: `上游返回 ${response.status}：${detail.slice(0, 200)}`,
        };
      }
      return { ok: true, latencyMs, model, error: null };
    } catch (error) {
      const latencyMs = Date.now() - started;
      const aborted = error instanceof Error && error.name === 'TimeoutError';
      return {
        ok: false,
        latencyMs,
        model,
        error: aborted
          ? '连接超时（15s）'
          : `连接失败：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
