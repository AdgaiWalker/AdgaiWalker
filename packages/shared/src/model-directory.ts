/**
 * 提供方目录（站主 2026-09-23 决定：复用 dsh 原生管理，不自建）。
 *
 * 唯一真相源是 dsh 自己的管理文件：
 * - `$DSH_HOME/settings.yaml` 的提供方段（llm-deepseek 等适配器段）：声明
 *   **提供方接口**（哪条适配器路由）、**API 网址**（baseURL）、**模型 id 及名称**（models 目录）；
 * - 凭据：<DSH_HOME>/credentials.env 的 `引用名=值`（引用名由 settings 段的 apiKeyEnv 声明）。
 *
 * 本模块只做纯解析与校验：把上面两份文档归一成可复用、可扩展的目录快照。
 * 不读取密钥值，不写文件，不依赖 apps。
 */

/** 一个模型条目：id 与显示名（dsh 目录项的子集）。 */
export interface ModelDirectoryModel {
  id: string;
  name: string;
}

/** 一个提供方条目：接口 / apiKey 引用 / API 网址 / 模型目录。 */
export interface ModelDirectoryProvider {
  /** 提供方接口 id（dsh 适配器路由名，如 deepseek-official）。 */
  id: string;
  /** 承载它的 dsh 适配器/设置段名（如 llm-deepseek）。 */
  interfaceName: string;
  /** 线协议（OpenAI / Anthropic / …）。 */
  protocol: WireProtocol;
  /** API 网址。缺省时为该接口的公开默认。 */
  baseURL: string;
  /** apiKey 引用名（环境变量名形态），可由提供方段覆盖。 */
  apiKeyRef: string;
  /** 该引用在当前凭据文档中是否有值。不暴露值本身。 */
  hasCredential: boolean;
  /** 模型 id 及名称。空数组表示适配器内置目录，未在此声明。 */
  models: ModelDirectoryModel[];
}

/** 目录快照：一次性读入的提供方集合与默认选择。 */
export interface ModelDirectorySnapshot {
  /** 快照生成时间（ISO）。 */
  generatedAt: string;
  /** 目录来源主目录（供排错，非密钥）。 */
  home: string;
  /** dsh 的默认模型选择（settings 的 agent-default-model）。 */
  defaultProvider: string | null;
  defaultModel: string | null;
  providers: ModelDirectoryProvider[];
}

/**
 * 线协议（wire protocol）—— 请求形状，不是厂商。
 *
 * 值与 `@deepseek-ai/dsh-llm-pi-ai` 的 `api` 字段逐字一致（该插件把它叫「协议」），
 * 因为我们要写回的就是它。同一家厂商可能同时支持多种协议（DeepSeek 同时提供
 * OpenAI 与 Anthropic 两种端点），所以协议是**路由/模型的属性**，不是厂商的属性。
 */
export type WireProtocol =
  | 'openai-completions'      // 事实标准：/chat/completions
  | 'openai-responses'        // OpenAI 新的 /responses
  | 'anthropic-messages'      // Claude 原生 /v1/messages
  | 'google-generative-ai'    // Gemini 原生
  | 'mistral-conversations'   // Mistral 原生
  | 'azure-openai-responses'
  | 'openai-codex-responses'
  | 'bedrock-converse-stream'
  | 'google-vertex';

/** 协议元数据：给界面如实标注「这是哪家的协议」。 */
export interface WireProtocolInfo {
  id: WireProtocol;
  /** 界面上显示的协议名。 */
  label: string;
  /** 归属家族，用于分组与排错。 */
  family: 'openai' | 'anthropic' | 'google' | 'mistral' | 'aws';
}

export const WIRE_PROTOCOLS: readonly WireProtocolInfo[] = [
  { id: 'openai-completions', label: 'OpenAI Chat Completions', family: 'openai' },
  { id: 'openai-responses', label: 'OpenAI Responses', family: 'openai' },
  { id: 'anthropic-messages', label: 'Anthropic Messages（Claude）', family: 'anthropic' },
  { id: 'google-generative-ai', label: 'Google Generative AI（Gemini）', family: 'google' },
  { id: 'mistral-conversations', label: 'Mistral Conversations', family: 'mistral' },
  { id: 'azure-openai-responses', label: 'Azure OpenAI Responses', family: 'openai' },
  { id: 'openai-codex-responses', label: 'OpenAI Codex Responses', family: 'openai' },
  { id: 'bedrock-converse-stream', label: 'AWS Bedrock Converse', family: 'aws' },
  { id: 'google-vertex', label: 'Google Vertex AI', family: 'google' },
] as const;

export function findWireProtocol(id: string): WireProtocolInfo | null {
  return WIRE_PROTOCOLS.find((item) => item.id === id) ?? null;
}

/** 已知提供方接口：路由 id → 设置段名 + 协议 + 默认 API 网址 + 默认凭据引用。 */
export interface KnownProviderInterface {
  /** 提供方路由 id（写进 settings 的段名或 pi-ai providers 的键）。 */
  route: string;
  /** 承载它的 dsh 设置段名（如 llm-deepseek）；pi-ai 路由则是 llm-pi-ai。 */
  settingsSection: string;
  /** 默认线协议。 */
  protocol: WireProtocol;
  /** 默认 API 网址。 */
  defaultBaseURL: string;
  /** 默认凭据引用名（环境变量名形态）。 */
  defaultApiKeyRef: string;
  /** 界面显示名。 */
  label: string;
}

/**
 * 可直接装载的提供方接口。
 *
 * 两条通道（都来自 dsh 0.1.5-rc.3 发布包，实测可共挂载，路由名不冲突）：
 * - `llm-deepseek`：**DeepSeek 直连**，只服务 DeepSeek 路由；
 * - `llm-pi-ai`：**多提供方适配器**，按 pi-ai 目录把请求路由到几十家提供方，
 *   并支持在路由上手写 `api`（协议）与 `baseURL`，因此任何 OpenAI/Anthropic
 *   兼容网关都能接入而无需改代码。
 *
 * 新增提供方 = 在此登记一行（或复用 pi-ai 已装的同名路由），不改其他代码。
 */
export const KNOWN_PROVIDER_INTERFACES: readonly KnownProviderInterface[] = [
  {
    route: 'deepseek-official',
    settingsSection: 'llm-deepseek',
    protocol: 'openai-completions',
    defaultBaseURL: 'https://api.deepseek.com',
    defaultApiKeyRef: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek 官方（直连）',
  },
  {
    route: 'anthropic',
    settingsSection: 'llm-pi-ai',
    protocol: 'anthropic-messages',
    defaultBaseURL: 'https://api.anthropic.com',
    defaultApiKeyRef: 'ANTHROPIC_API_KEY',
    label: 'Anthropic（Claude 原生协议）',
  },
  {
    route: 'openai',
    settingsSection: 'llm-pi-ai',
    protocol: 'openai-responses',
    defaultBaseURL: 'https://api.openai.com/v1',
    defaultApiKeyRef: 'OPENAI_API_KEY',
    label: 'OpenAI',
  },
  {
    route: 'google',
    settingsSection: 'llm-pi-ai',
    protocol: 'google-generative-ai',
    defaultBaseURL: 'https://generativelanguage.googleapis.com',
    defaultApiKeyRef: 'GEMINI_API_KEY',
    label: 'Google Gemini',
  },
  {
    route: 'zai',
    settingsSection: 'llm-pi-ai',
    protocol: 'openai-completions',
    defaultBaseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultApiKeyRef: 'ZAI_API_KEY',
    label: '智谱 GLM',
  },
  {
    route: 'moonshotai',
    settingsSection: 'llm-pi-ai',
    protocol: 'openai-completions',
    defaultBaseURL: 'https://api.moonshot.cn/v1',
    defaultApiKeyRef: 'MOONSHOT_API_KEY',
    label: '月之暗面 Kimi',
  },
  {
    route: 'xai',
    settingsSection: 'llm-pi-ai',
    protocol: 'openai-responses',
    defaultBaseURL: 'https://api.x.ai/v1',
    defaultApiKeyRef: 'XAI_API_KEY',
    label: 'xAI Grok',
  },
  {
    route: 'minimax',
    settingsSection: 'llm-pi-ai',
    protocol: 'anthropic-messages',
    defaultBaseURL: 'https://api.minimax.io/anthropic',
    defaultApiKeyRef: 'MINIMAX_API_KEY',
    label: 'MiniMax（Anthropic 协议）',
  },
  {
    route: 'mistral',
    settingsSection: 'llm-pi-ai',
    protocol: 'mistral-conversations',
    defaultBaseURL: 'https://api.mistral.ai/v1',
    defaultApiKeyRef: 'MISTRAL_API_KEY',
    label: 'Mistral',
  },
  {
    route: 'openrouter',
    settingsSection: 'llm-pi-ai',
    protocol: 'openai-completions',
    defaultBaseURL: 'https://openrouter.ai/api/v1',
    defaultApiKeyRef: 'OPENROUTER_API_KEY',
    label: 'OpenRouter（聚合网关）',
  },
] as const;

export interface ParseModelDirectoryInput {
  /** settings.yaml 解析后的对象（或 null）。 */
  settings: unknown;
  /** .credentials.yaml 里 refs 段的键名集合（只有名字，没有值）。 */
  credentialRefs: readonly string[];
  /** 目录主目录（写进快照供排错）。 */
  home: string;
  /** 快照时间，便于测试固定。 */
  now?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** 解析模型目录项：只接受有非空 id 的条目，名称缺省回落到 id。 */
export function parseModelDirectoryModels(raw: unknown): ModelDirectoryModel[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const models: ModelDirectoryModel[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    const id = record ? asString(record.id) : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push({ id, name: (record && asString(record.name)) ?? id });
  }
  return models;
}

/**
 * 把 dsh 的 settings + 凭据引用名归一成目录快照（fail-closed：坏形状不猜测，跳过该段）。
 * 只登记 KNOWN_PROVIDER_INTERFACES 里已支持装载的接口，其余设置段不当作提供方。
 */
export function parseModelDirectory(input: ParseModelDirectoryInput): ModelDirectorySnapshot {
  const settings = asRecord(input.settings) ?? {};
  const refs = new Set(input.credentialRefs);

  const providers: ModelDirectoryProvider[] = KNOWN_PROVIDER_INTERFACES.map((known) => {
    const root = asRecord(settings[known.settingsSection]);
    const section = known.settingsSection === 'llm-pi-ai'
      ? asRecord(asRecord(root?.providers)?.[known.route])
      : root;
    const apiKeyRef = (section && asString(section.apiKeyEnv)) ?? known.defaultApiKeyRef;
    const rawProtocol = section && asString(section.api);
    return {
      id: known.route,
      interfaceName: known.settingsSection,
      protocol: (rawProtocol && findWireProtocol(rawProtocol) ? rawProtocol : known.protocol) as WireProtocol,
      baseURL: (section && asString(section.baseURL)) ?? known.defaultBaseURL,
      apiKeyRef,
      hasCredential: refs.has(apiKeyRef),
      models: parseModelDirectoryModels(section?.models),
    };
  });

  const defaultModelSection = asRecord(settings['agent-default-model']);
  return {
    generatedAt: input.now ?? new Date().toISOString(),
    home: input.home,
    defaultProvider: (defaultModelSection && asString(defaultModelSection.provider)) ?? null,
    defaultModel: (defaultModelSection && asString(defaultModelSection.model)) ?? null,
    providers,
  };
}

/** 按 id 找提供方。 */
export function findProvider(
  snapshot: ModelDirectorySnapshot,
  id: string,
): ModelDirectoryProvider | null {
  return snapshot.providers.find((provider) => provider.id === id) ?? null;
}

/**
 * 选择用于真实调用的提供方：显式指定优先，否则默认提供方（须有凭据），
 * 再否则第一个有凭据的提供方。都没有则返回 null（调用方如实报不可用）。
 */
export function pickUsableProvider(
  snapshot: ModelDirectorySnapshot,
  preferred?: { provider?: string | null; model?: string | null },
): { provider: ModelDirectoryProvider; model: string | null } | null {
  const usable = (provider: ModelDirectoryProvider | null) =>
    provider && provider.hasCredential ? provider : null;

  if (preferred?.provider) {
    const explicit = findProvider(snapshot, preferred.provider);
    if (explicit && explicit.hasCredential) {
      return { provider: explicit, model: preferred.model ?? null };
    }
    return null;
  }

  const byDefault = usable(
    snapshot.defaultProvider ? findProvider(snapshot, snapshot.defaultProvider) : null,
  );
  if (byDefault) {
    return { provider: byDefault, model: snapshot.defaultModel ?? preferred?.model ?? null };
  }

  const firstCredentialed = snapshot.providers.find((provider) => provider.hasCredential) ?? null;
  if (firstCredentialed) {
    return { provider: firstCredentialed, model: preferred?.model ?? null };
  }
  return null;
}

/** 管理端（Agent 编辑）用的提供方视图：直接来自 dsh 目录，不落自有数据库。 */
export interface AgentModelProviderView {
  /** 提供方接口 id（dsh 适配器路由名）。 */
  id: string;
  /** 承载它的 dsh 设置段名。 */
  interfaceName: string;
  /** 线协议（OpenAI / Anthropic / …），界面据此如实标注。 */
  protocol: WireProtocol;
  /** 协议的可读名。 */
  protocolLabel: string;
  /** API 网址。 */
  baseURL: string;
  /** apiKey 引用名（不暴露值）。 */
  apiKeyRef: string;
  /** 该引用在凭据来源里是否有值。 */
  hasCredential: boolean;
  /** 是否为 dsh 当前默认提供方（agent-default-model）。 */
  isDefault: boolean;
  /** 可选模型：dsh 设置里声明的目录，加上 dsh 默认模型。 */
  models: ModelDirectoryModel[];
}

/** Agent 编辑页的模型目录载荷。source 固定 dsh，便于前端如实标注来源。 */
export interface AgentModelCatalog {
  source: 'dsh';
  /** 目录主目录（排错用）。 */
  home: string;
  defaultProvider: string | null;
  defaultModel: string | null;
  providers: AgentModelProviderView[];
}

/**
 * 把目录快照整理成 Agent 编辑页可用的形态。
 *
 * 模型列表 = dsh 设置里声明的目录；若该提供方是 dsh 默认提供方，
 * 再确保默认模型在列（dsh 内置目录不对外导出，这里只呈现「已声明 + 正在用」的部分，
 * 其余模型 id 由 dsh 在请求时校验，故前端允许直接填写）。
 */
export function buildAgentModelCatalog(snapshot: ModelDirectorySnapshot): AgentModelCatalog {
  return {
    source: 'dsh',
    home: snapshot.home,
    defaultProvider: snapshot.defaultProvider,
    defaultModel: snapshot.defaultModel,
    providers: snapshot.providers.map((provider) => {
      const isDefault = snapshot.defaultProvider === provider.id;
      const models = [...provider.models];
      if (isDefault && snapshot.defaultModel && !models.some((m) => m.id === snapshot.defaultModel)) {
        models.unshift({ id: snapshot.defaultModel, name: snapshot.defaultModel });
      }
      return {
        id: provider.id,
        interfaceName: provider.interfaceName,
        protocol: provider.protocol,
        protocolLabel: findWireProtocol(provider.protocol)?.label ?? provider.protocol,
        baseURL: provider.baseURL,
        apiKeyRef: provider.apiKeyRef,
        hasCredential: provider.hasCredential,
        isDefault,
        models,
      };
    }),
  };
}


/**
 * 预置模型目录 —— 每个厂商只留 **3 个代表作**（最新旗舰 / 均衡 / 快速），
 * 便于界面「快速添加」，不是权威全集（完整目录在 dsh/pi-ai 内置，未列出的 id 仍可手填）。
 *
 * 数据来源与核对时间（2026-09-23）：
 * - **DeepSeek**：官方文档 api-docs.deepseek.com（「Models & Pricing」与「Lists Models」）。
 *   官方只列 **2 个**在服务型号：`deepseek-flash`（DeepSeek-V4.1-Flash，2026-09-10，支持视觉）
 *   与 `deepseek-v4-pro`（DeepSeek-V4-Pro-0813）。第三项取 **已下线的 vision-exp** 并如实标注
 *   ——官方原文：旧名仍被接受，但请求由 V4.1-Flash 提供并按 Flash 计费。
 * - **Anthropic**：pi-ai `anthropic` 目录（14 项），取最新的 opus-5 / sonnet-5 / haiku-4-5。
 * - **OpenAI**：pi-ai `openai` 目录（39 项），取最新的 gpt-5.6 三兄弟（terra / sol / luna）。
 * - **Google**：pi-ai `google` 目录（22 项），取 gemini-3.8-flash / 3.5-flash / 2.5-pro。
 * - **智谱**：pi-ai `zai` 目录（7 项），取 glm-5.3 / 5.3-flash / 5.2。
 * - **月之暗面**：pi-ai `moonshotai` 目录（10 项），取 kimi-k3 / k2.7-code / k2.6。
 * - **xAI**：pi-ai `xai` 目录（3 项），全部收录 grok-4.6 / 4.5 / 4.3。
 */
export interface ModelPreset {
  id: string;
  name: string;
  /** 该模型用的线协议（同厂商可能不同，如 DeepSeek 两种端点都支持）。 */
  protocol: WireProtocol;
  /** 上下文窗口（token），供界面如实展示。 */
  contextWindow?: number;
  /** 备注，如「已下线」。 */
  note?: string;
}

/** 按提供方路由分组的预置模型。 */
export const MODEL_PRESETS_BY_PROVIDER: Readonly<Record<string, readonly ModelPreset[]>> = {
  'deepseek-official': [
    { id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash', protocol: 'openai-completions', contextWindow: 1_000_000, note: '最新，支持图像输入' },
    { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro-0813', protocol: 'openai-completions', contextWindow: 1_000_000 },
    { id: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek-V4-Flash-Vision-Exp', protocol: 'openai-completions', contextWindow: 1_000_000, note: '已下线，请求由 V4.1-Flash 提供' },
  ],
  anthropic: [
    { id: 'claude-opus-5', name: 'Claude Opus 5', protocol: 'anthropic-messages', contextWindow: 1_000_000 },
    { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', protocol: 'anthropic-messages', contextWindow: 1_000_000 },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', protocol: 'anthropic-messages', contextWindow: 200_000 },
  ],
  openai: [
    { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', protocol: 'openai-responses', contextWindow: 1_050_000 },
    { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', protocol: 'openai-responses', contextWindow: 1_050_000 },
    { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', protocol: 'openai-responses', contextWindow: 1_050_000 },
  ],
  google: [
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', protocol: 'google-generative-ai', contextWindow: 1_048_576 },
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', protocol: 'google-generative-ai', contextWindow: 1_048_576 },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', protocol: 'google-generative-ai', contextWindow: 1_048_576 },
  ],
  zai: [
    { id: 'glm-5.3', name: 'GLM-5.3', protocol: 'openai-completions', contextWindow: 1_000_000 },
    { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', protocol: 'openai-completions', contextWindow: 1_000_000, note: '支持图像输入' },
    { id: 'glm-5.2', name: 'GLM-5.2', protocol: 'openai-completions', contextWindow: 1_000_000 },
  ],
  moonshotai: [
    { id: 'kimi-k3', name: 'Kimi K3', protocol: 'openai-completions', contextWindow: 1_048_576 },
    { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', protocol: 'openai-completions', contextWindow: 262_144 },
    { id: 'kimi-k2.6', name: 'Kimi K2.6', protocol: 'openai-completions', contextWindow: 262_144 },
  ],
  xai: [
    { id: 'grok-4.6', name: 'Grok 4.6', protocol: 'openai-responses', contextWindow: 500_000 },
    { id: 'grok-4.5', name: 'Grok 4.5', protocol: 'openai-responses', contextWindow: 500_000 },
    { id: 'grok-4.3', name: 'Grok 4.3', protocol: 'openai-responses', contextWindow: 1_000_000 },
  ],
  minimax: [
    { id: 'MiniMax-M3', name: 'MiniMax M3', protocol: 'anthropic-messages', contextWindow: 1_048_576 },
    { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', protocol: 'anthropic-messages', contextWindow: 204_800 },
    { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax M2.7 HighSpeed', protocol: 'anthropic-messages', contextWindow: 204_800 },
  ],
  mistral: [
    { id: 'mistral-large-latest', name: 'Mistral Large', protocol: 'mistral-conversations', contextWindow: 262_144 },
    { id: 'devstral-latest', name: 'Devstral', protocol: 'mistral-conversations', contextWindow: 262_144 },
    { id: 'codestral-latest', name: 'Codestral', protocol: 'mistral-conversations', contextWindow: 256_000 },
  ],
  openrouter: [
    { id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash（经 OpenRouter）', protocol: 'openai-completions', contextWindow: 1_048_576 },
    { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5（经 OpenRouter）', protocol: 'anthropic-messages', contextWindow: 1_000_000 },
    { id: 'openai/gpt-5.6-terra', name: 'GPT-5.6 Terra（经 OpenRouter）', protocol: 'openai-completions', contextWindow: 1_050_000 },
  ],
};

/** 取某个提供方的预置模型；未登记则返回空数组（界面仍允许手填）。 */
export function modelPresetsFor(providerId: string): readonly ModelPreset[] {
  return MODEL_PRESETS_BY_PROVIDER[providerId] ?? [];
}
