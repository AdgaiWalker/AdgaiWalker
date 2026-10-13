/**
 * 每个 Agent 的独立 Harness 环境（R26，2026-09-23 站主决定）。
 *
 * 站主明确：AdgaiWalker 里的 Agent 各自有独立配置（模型、系统提示词、插件），
 * 用与 dsh 同款的 **Cordis 框架**，能承接外部插件；不连站主个人正在用的 dsh 环境。
 *
 * 目录布局（home 由部署指定，默认 apps/api/data/dsh-home）：
 *   <home>/settings.yaml              共享层默认（凭据引用等）
 *   <home>/.credentials.yaml          共用凭据（站主手工填）
 *   <home>/agents/<agentId>/settings.yaml  该 Agent 的覆盖层（模型/提示词/插件设置）
 *   <home>/agents/<agentId>/profiles/sdk/  该 Agent 的 Cordis 组合（dsh 自动生成，可装外部插件）
 *
 * 本模块是纯函数：只做「共享层 + Agent 层」的合并与校验，不碰文件系统。
 */

/** Agent 环境的可公开描述（不含任何凭据值）。 */
export interface AgentHomeView {
  agentId: string;
  /** 该 Agent 的 home 目录（绝对路径，排错用）。 */
  homeDir: string;
  /** 该 Agent 的 Cordis profile 目录（外部插件装在它的 package.json）。 */
  profileDir: string;
  /** 是否已有自己的 settings.yaml（覆盖层）。 */
  hasOwnSettings: boolean;
  /** 解析后的默认提供方 / 模型（Agent 覆盖优先，共享层兜底）。 */
  defaultProvider: string | null;
  defaultModel: string | null;
  /** 实际生效的凭据引用名（Agent 可单独指定，否则用共享层）。 */
  apiKeyRef: string | null;
  /** 该引用是否解析到了值（只看有无，不暴露值）。 */
  hasCredential: boolean;
}

/** Agent id 只允许安全字符，避免路径穿越到共享层之外。 */
export const AGENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export function isSafeAgentId(agentId: string): boolean {
  return AGENT_ID_PATTERN.test(agentId);
}

/**
 * 拼接 Agent 的 home 目录。**fail-closed**：非法 agentId 直接抛错，
 * 不允许 `..` / 分隔符等把 home 指到共享层或其他 Agent 之外。
 */
export function agentHomeDir(rootHome: string, agentId: string): string {
  if (!isSafeAgentId(agentId)) throw new Error(`agent-id-unsafe: ${agentId}`);
  return `${rootHome.replace(/[/\\]+$/, '')}/agents/${agentId}`;
}

/** Agent 的 Cordis profile 目录（dsh 的 profile 名固定为 sdk）。 */
export function agentProfileDir(rootHome: string, agentId: string): string {
  return `${agentHomeDir(rootHome, agentId)}/profiles/sdk`;
}

export interface ResolveAgentHomeInput {
  rootHome: string;
  agentId: string;
  /** 共享层 settings.yaml 解析结果。 */
  sharedSettings: unknown;
  /** 该 Agent 自己的 settings.yaml 解析结果（没有则为 null）。 */
  agentSettings: unknown | null;
  /** 共享凭据文档里的 refs 键名。 */
  sharedCredentialRefs: readonly string[];
  /** 该 Agent 自己凭据文档里的 refs 键名（可选，单独配时用）。 */
  agentCredentialRefs?: readonly string[];
  /** 已支持的提供方接口段名，默认 llm-deepseek。 */
  settingsSection?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * 合并「共享层 + Agent 层」得到该 Agent 的有效环境描述。
 * 合并规则：Agent 层字段优先，缺失时回落共享层；两层都没有则给接口默认。
 */
export function resolveAgentHome(input: ResolveAgentHomeInput): AgentHomeView {
  const section = input.settingsSection ?? 'llm-deepseek';
  const shared = asRecord(input.sharedSettings) ?? {};
  const own = asRecord(input.agentSettings) ?? {};

  const sharedSection = asRecord(shared[section]) ?? {};
  const ownSection = asRecord(own[section]) ?? {};

  const apiKeyRef =
    asString(ownSection.apiKeyEnv) ?? asString(sharedSection.apiKeyEnv) ?? null;

  const sharedDefault = asRecord(shared['agent-default-model']);
  const ownDefault = asRecord(own['agent-default-model']);
  const defaultProvider =
    asString(ownDefault?.provider) ?? asString(sharedDefault?.provider) ?? null;
  const defaultModel = asString(ownDefault?.model) ?? asString(sharedDefault?.model) ?? null;

  // 凭据：Agent 自己的凭据文档优先，否则共享层（共用一份的情形）。
  const refs = new Set<string>([
    ...(input.agentCredentialRefs ?? []),
    ...input.sharedCredentialRefs,
  ]);

  return {
    agentId: input.agentId,
    homeDir: agentHomeDir(input.rootHome, input.agentId),
    profileDir: agentProfileDir(input.rootHome, input.agentId),
    hasOwnSettings: input.agentSettings !== null && input.agentSettings !== undefined,
    defaultProvider,
    defaultModel,
    apiKeyRef,
    hasCredential: apiKeyRef !== null && refs.has(apiKeyRef),
  };
}

/** Agent 级模型与凭据配置的写入载荷（PATCH 语义：字段不传表示不改动）。 */
export interface AgentModelConfigInput {
  /** 提供方路由 id（deepseek-official / anthropic / …）。传 null 表示清空为「未连接」。 */
  providerId?: string | null;
  /** 模型 id —— 真正发给上游的标识。 */
  modelId?: string;
  /** 显示名；留空回落到 modelId。 */
  modelName?: string;
  /**
   * 该 Agent 自己的 API Key。
   * - 不传 / 空串 = 不改动已有 Key；
   * - null = 删除该 Agent 自己的 Key（此后回落全局）；
   * - 非空字符串 = 写入该 Agent 自己的 Key。
   */
  apiKey?: string | null;
  /** 该 Agent 专用凭据的引用名（环境变量名形态）；不传则沿用全局引用名。 */
  apiKeyRef?: string;
}

/** 凭据来源：Agent 自己配的，还是回落全局（诚实展示用）。 */
export type CredentialScope = 'agent' | 'shared' | 'none';

/** Agent 级模型与凭据配置的可公开视图（绝不包含凭据值）。 */
export interface AgentModelConfigView {
  agentId: string;
  /** 该 Agent 的 home 目录（排错用）。 */
  homeDir: string;
  /** 生效的提供方路由。 */
  providerId: string | null;
  /** 生效的模型 id。 */
  modelId: string | null;
  /** 生效的显示名（未设则等于 modelId）。 */
  modelName: string | null;
  /** 生效的提供方 API 地址与线协议（只读；来自共享 dsh 路由）。 */
  baseURL: string | null;
  protocol: string | null;
  /** 上述值是否来自该 Agent 自己的覆盖层（false = 回落共享层）。 */
  providerFromAgent: boolean;
  modelFromAgent: boolean;
  /** 生效的凭据引用名。 */
  apiKeyRef: string | null;
  /** 凭据来源：agent（自己配的）/ shared（回落全局）/ none（都没有）。 */
  credentialScope: CredentialScope;
  /** 该引用当前是否解析到了值（只看有无，不返回值）。 */
  hasCredential: boolean;
  /** 是否已存在该 Agent 自己的凭据（界面据此提示「已单独配置」）。 */
  hasOwnCredential: boolean;
  /** 已登记的提供方路由，供界面下拉。 */
  knownProviders: readonly string[];
}

/** 解析 Agent 覆盖层里的显示名（与 modelId 分开保存，未设则回落 modelId）。 */
export function resolveModelName(own: unknown, shared: unknown, modelId: string | null): string | null {
  const ownDefault = asRecord(asRecord(own)?.['agent-default-model']) ?? {};
  const sharedDefault = asRecord(asRecord(shared)?.['agent-default-model']) ?? {};
  return asString(ownDefault.modelName) ?? asString(sharedDefault.modelName) ?? modelId;
}
