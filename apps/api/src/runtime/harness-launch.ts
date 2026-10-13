/**
 * 公共 Harness 启动配方。
 * 子进程环境只保留启动所需变量和当前 provider 的一个凭据；
 * 工具面用 dsh-base 0.1.5-rc.3 的插件 id，按 sdk-app 的 patch 形式关闭。
 * sdk-minimal 仍挂持久 shell，不能当作只读隔离。
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client';
import { READ_ONLY_PROFILE, agentHomeDir, isSafeAgentId } from '@walker/shared';
import { resolveModelHomeDir } from './dsh-home-paths';
import { mergeSettingsProviderRoute, mergeSettingsSection, readSettingsObject } from './dsh-settings-file';
import { readCredential } from './dsh-credentials-file';
import type { ModelDirectoryPort } from '../ports/model-directory.port';

// SDK 的 dsh 二进制定位器在 dev 下不可用（tsx/esbuild 把 import.meta 转成 CommonJS
// shim，import.meta.resolve 变成 undefined）——所以本地 dev 必须显式给 dshBin。
// 探测与生产已用 WALKER_DSH_RUNTIME_BIN 走的是同一条路；这里把那条路也作为默认兜底。
const requireDsh = createRequire(__filename);
function resolveDshBinFallback(): string | null {
  try {
    const manifest = requireDsh.resolve('@deepseek-ai/dsh/package.json');
    const bin = path.join(path.dirname(manifest), 'lib', 'bin.js');
    return fs.existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}

/** 与 @deepseek-ai/dsh-subprocess 的 SENSITIVE_ENV_PATTERN 相同。白名单结果再用它拒绝凭据形名字。 */
const SENSITIVE_ENV_PATTERN = /KEY|PASSWORD|SECRET|TOKEN/i;

const DENIED_ENV_NAMES = ['WALKER_ADMIN_TOKEN', 'WALKER_CREDENTIAL_MASTER_KEY', 'DATABASE_URL'] as const;

/** Node 启动和出网代理所需。其余父进程变量不进入子进程。 */
const PROCESS_ENV_ALLOWLIST = [
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC',
  'TEMP', 'TMP', 'TMPDIR',
  'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'LANG', 'LC_ALL', 'LC_CTYPE',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY',
  'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy',
] as const;

/**
 * dsh-base `cordis.patch.yml` 里对模型可见的通用工具。
 * 文件：tool-fs / tool-fs-search / skill-filesystem / tool-skill / agent-instructions
 * shell：tool-bash / tool-pwsh / tool-jobs
 * 网络：tool-web / web / web-search-deepseek / web-fetch-http
 * MCP：sdk profile 不挂载 @deepseek-ai/dsh-mcp-client，patch 不插入它。
 */
export const DISABLED_HARNESS_PLUGINS = [
  'tool-bash',
  'tool-pwsh',
  'tool-jobs',
  'tool-fs',
  'tool-fs-search',
  'tool-skill',
  'skill-filesystem',
  'agent-instructions',
  'tool-web',
  'web',
  'web-search-deepseek',
  'web-fetch-http',
] as const;

export type HarnessAudience = 'public' | 'admin';

export interface ProviderCredential {
  envName: string;
  value: string;
}

/**
 * 启动一个提供方所需的全部事实，来自 dsh 原生目录（settings + credentials）。
 * 不再内置提供方白名单：加提供方 = 改 dsh 配置，不改这里。
 */
export interface HarnessProviderFacts {
  /** 适配器路由 id，如 deepseek-official。 */
  route: string;
  /** 承载它的设置段名，如 llm-deepseek。 */
  settingsSection: string;
  /** API 网址；写进子进程 home 的 settings。 */
  baseURL: string;
  /** pi-ai route wire protocol. */
  api?: string;
  /** 凭据引用名（环境变量名形态）。 */
  apiKeyRef: string;
  /** 模型目录（id + name）；空表示适配器内置目录。 */
  models: readonly { id: string; name: string }[];
}

export interface HarnessLaunchOptions {
  audience: HarnessAudience;
  /** 该 Agent 的 id：给定则用它的独立 home（`agents/<agentId>`），实现 Agent 间配置隔离。 */
  agentId?: string | null;
  provider?: string;
  model?: string;
  credential?: ProviderCredential | null;
  /** 目录解析出的提供方事实；缺省时按未配置的 deepseek-official 处理。 */
  providerFacts?: HarnessProviderFacts | null;
  modelDirectory?: ModelDirectoryPort;
  parentEnv?: NodeJS.ProcessEnv;
  homeDir?: string;
  materialsDir?: string;
}

export interface HarnessToolProfile {
  id: typeof READ_ONLY_PROFILE.id;
  version: typeof READ_ONLY_PROFILE.version;
  configHash: string;
}

export interface HarnessLaunch {
  audience: HarnessAudience;
  provider: string;
  model: string;
  dshHome: string;
  materialsDir: string;
  cwd: string;
  processCwd: string;
  env: Record<string, string>;
  profile: 'sdk';
  patchPath: string;
  toolProfile: HarnessToolProfile;
  dshBin?: string;
}

/** 把一段用户文本转成安全的 YAML 字面块（缩进 6 空格）。 */
function yamlBlock(text: string, indent = '      '): string[] {
  // 用字面块（|-）避免转义问题；行首多余空白保留，空行也保留。
  return text.split(/\r?\n/).map((line) => indent + line);
}

export function readOnlyToolPatch(persona?: string | null): string {
  const lines = [
    '# Walker read-only tool profile. 沙箱模式是字面量 read-only。',
    '# 不插入 @deepseek-ai/dsh-mcp-client。',
    ...DISABLED_HARNESS_PLUGINS.flatMap((id) => ['- id: ' + id, '  disabled: true']),
    '- id: sandbox-policy',
    '  config:',
    '    mode: read-only',
    '    workspaceRoot: !!js process.env.WALKER_MATERIALS_DIR',
    '- id: approval',
    '  config:',
    '    policy: ask',
  ];

  // Agent 提示词 → dsh 系统提示词。
  //
  // 这是**唯一**能让「后台配的 Agent 人格」真正进入模型的通道（R32）：
  // - dsh-system-prompt 的 personaPrefix 是官方部署 persona 入口；
  // - RuntimeRunRequest 只有纯文本 prompt（协议里 SessionPromptParams 明确写着
  //   "sent verbatim as the user message"），没有 system 字段；
  // - agent-instructions（AGENTS.md）在本仓被 patch 显式 disabled。
  // 若不注入，Agent 跑的是 dsh 的默认通用助手人格——配了等于没配。
  const text = persona?.trim();
  if (text) {
    lines.push(
      '- id: system-prompt',
      '  config:',
      '    personaPrefix: |-',
      ...yamlBlock(text),
    );
  }

  lines.push('');
  return lines.join('\n');
}

export const HARNESS_TOOL_PROFILE: HarnessToolProfile = {
  id: READ_ONLY_PROFILE.id,
  version: READ_ONLY_PROFILE.version,
  configHash: createHash('sha256').update(readOnlyToolPatch()).digest('hex'),
};

/**
 * 解析本次运行的 Harness home（R26）。
 *
 * 优先级：
 * 1. **Agent 级隔离**（给定 agentId）：`<AdgaiWalker DSH_HOME>/agents/<agentId>`——
 *    每个 Agent 一个独立 home，配置、插件、会话互不串；非法 agentId fail-closed。
 * 2. **受众级兜底**（无 agentId）：保留 R10 的前后台分离（`.dsh-assistant` / `.dsh-admin`）。
 *
 * 注意：Agent 级 home 挂在 AdgaiWalker 自己的 DSH_HOME 下（`resolveModelHomeDir`），
 * **不落在站主个人 `~/.dsh`**。
 */
export function resolveSessionHome(
  audience: HarnessAudience,
  parent: NodeJS.ProcessEnv,
  homeDir: string,
  agentId?: string | null,
  modelHomeDir?: string,
): string {
  const id = agentId?.trim();
  if (id) {
    if (!isSafeAgentId(id)) throw new Error(`agent-id-unsafe: ${id}`);
    return agentHomeDir(modelHomeDir ?? resolveModelHomeDir(parent), id);
  }
  const override = audience === 'public' ? parent.ASSISTANT_DSH_HOME : parent.WALKER_DSH_ADMIN_HOME;
  const fallback = path.join(homeDir, audience === 'public' ? '.dsh-assistant' : '.dsh-admin');
  const raw = override?.trim();
  if (!raw) return fallback;
  return path.isAbsolute(raw) ? raw : path.resolve(homeDir, raw);
}

// settings.yaml 的读写统一在 dsh-settings-file.ts（配置界面与运行时共用同一份合并逻辑）。

function readEnv(parent: NodeJS.ProcessEnv, name: string): string | undefined {
  const direct = parent[name];
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const target = name.toUpperCase();
  for (const [key, value] of Object.entries(parent)) {
    if (key.toUpperCase() === target && typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/** 未配置目录时的兜底事实：等价于 dsh-llm-deepseek 的公开默认。 */
export const DEFAULT_PROVIDER_FACTS: HarnessProviderFacts = {
  route: 'deepseek-official',
  settingsSection: 'llm-deepseek',
  baseURL: 'https://api.deepseek.com',
  apiKeyRef: 'DEEPSEEK_API_KEY',
  models: [],
};

/** 引用名必须是可作环境变量名的形态，避免把任意字符串写进子进程环境。 */
const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * 解析本次运行要注入的凭据。
 *
 * 优先级（站主定稿「独立配置，可选全局」）：
 *   显式传入 > 该 Agent 自己的 Key > 环境变量 > 共享层（全局）Key
 *
 * Agent 自己的 Key 排在最前（除显式传入外）——否则「每个 Agent 单独配 Key」
 * 只是存下来了、运行时永远用不到，等于假功能。
 */
function providerCredential(
  facts: HarnessProviderFacts,
  parent: NodeJS.ProcessEnv,
  explicit: ProviderCredential | null | undefined,
  agentHomeDir?: string | null,
): ProviderCredential | null {
  const envName = facts.apiKeyRef;
  if (!CREDENTIAL_REF_PATTERN.test(envName)) return null;
  if (explicit === null) return null;
  if (explicit) {
    if (explicit.envName !== envName || explicit.value.trim() === '') return null;
    return { envName, value: explicit.value };
  }
  // 1) 该 Agent 自己的 Key（独立配置优先）
  if (agentHomeDir) {
    const own = readCredential(agentHomeDir, envName);
    if (own) return { envName, value: own };
  }
  // 2) 环境变量：部署时可用 env 覆盖（如服务器 .env 注入）
  const fromEnv = readEnv(parent, envName);
  if (fromEnv) return { envName, value: fromEnv };
  // 3) 共享层（全局）Key——后台「模型连接」配置界面写的就是这里
  const fromFile = readCredential(resolveModelHomeDir(parent), envName);
  return fromFile ? { envName, value: fromFile } : null;
}

/**
 * 把提供方事实写进子进程自己的 dsh home：settings.yaml 的接口段。
 * 这是"复用 dsh 原生管理"的落点——子进程按自己的配置解析网址与模型目录。
 *
 * 凭据不走文件：实测 dsh 0.1.5-rc.3 的 sdk profile 只要 home 里存在 .credentials.yaml
 * 就启动失败（JSON-RPC -32603 / cannot create effect on inactive context），无论文件是否带
 * version 信封。凭据值经环境变量传入（引用名仍由本函数的 apiKeyEnv 声明），
 * 与 dsh 凭据缝「settings 持引用名、provider 持值」一致。
 * 顺带清理历史残留的凭据文件，避免旧格式把启动打挂。
 */
export function syncProviderHome(
  dshHome: string,
  facts: HarnessProviderFacts,
  _credential?: ProviderCredential | null,
): void {
  fs.mkdirSync(dshHome, { recursive: true, mode: 0o700 });
  const settingsPath = path.join(dshHome, 'settings.yaml');

  // **保留式合并**：Agent 的 settings.yaml 还承载它自己的配置（如 agent-default-model），
  // 整文件覆盖会把 Agent 的模型配置冲掉——这是 R26 的 per-agent home 必须修正的点。
  const section: Record<string, unknown> = { apiKeyEnv: facts.apiKeyRef, baseURL: facts.baseURL, models: facts.models.map((m) => ({ id: m.id, name: m.name })) };
  if (facts.settingsSection === 'llm-pi-ai' && facts.api) section.api = facts.api;
  if (facts.settingsSection === 'llm-pi-ai') mergeSettingsProviderRoute(settingsPath, facts.route, section);
  else mergeSettingsSection(settingsPath, facts.settingsSection, section);

  const credentialsPath = path.join(dshHome, '.credentials.yaml');
  if (fs.existsSync(credentialsPath)) fs.rmSync(credentialsPath);
}

export function harnessChildEnv(input: {
  parent: NodeJS.ProcessEnv;
  dshHome: string;
  materialsDir: string;
  provider?: string;
  facts?: HarnessProviderFacts | null;
  credential?: ProviderCredential | null;
  agentHome?: string | null;
}): Record<string, string> {
  const allowed = new Set<string>(PROCESS_ENV_ALLOWLIST.map((name) => name.toUpperCase()));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.parent)) {
    if (typeof value === 'string' && allowed.has(key.toUpperCase())) env[key] = value;
  }
  env.DSH_HOME = input.dshHome;
  env.WALKER_MATERIALS_DIR = input.materialsDir;
  if (!input.parent.DSH_TELEMETRY_ENABLED_OVERRIDE) env.DSH_TELEMETRY_DISABLED = '1';
  // 凭据值经环境变量传入；名字来自提供方目录（可扩展），不是硬编码的单一供应商。
  // fail-closed：请求的 provider 与目录事实不是同一条路由时，不转发任何凭据。
  const facts = input.facts ?? DEFAULT_PROVIDER_FACTS;
  const routeMatches = input.provider === undefined || input.provider === facts.route;
  const credential = routeMatches ? providerCredential(facts, input.parent, input.credential, input.agentHome) : null;
  if (credential) env[credential.envName] = credential.value;
  for (const name of Object.keys(env)) {
    const denied = DENIED_ENV_NAMES.some((item) => item.toUpperCase() === name.toUpperCase());
    const sensitive = SENSITIVE_ENV_PATTERN.test(name) && name !== credential?.envName;
    if (denied || sensitive) throw new Error(`harness child env refused ${name}`);
  }
  return env;
}

export function planHarnessLaunch(options: HarnessLaunchOptions): HarnessLaunch {
  const parent = options.parentEnv ?? process.env;
  // homeDir 只用于「受众级兜底目录」（无 agentId 时）与覆盖路径解析。
  // 默认必须落在 AdgaiWalker 自己的数据根目录里——**不能是 os.homedir()**：
  // 那会把 .dsh-admin / .dsh-assistant 写进站主家目录（R26 要求不与个人环境混用；
  // 实测已在 ~/ 下留下孤儿目录）。
  const homeDir = options.homeDir ?? options.modelDirectory?.homeDir() ?? resolveModelHomeDir(parent);
  const facts = options.providerFacts ?? DEFAULT_PROVIDER_FACTS;
  const provider = options.provider ?? facts.route;
  const model = options.model ?? 'deepseek-v4-flash';
  const dshHome = resolveSessionHome(options.audience, parent, homeDir, options.agentId, options.modelDirectory?.homeDir());
  const materialsDir = options.materialsDir ? path.resolve(options.materialsDir) : path.join(dshHome, 'materials');
  const bin = readEnv(parent, 'WALKER_DSH_RUNTIME_BIN') ?? resolveDshBinFallback();
  return {
    audience: options.audience,
    provider,
    model,
    dshHome,
    materialsDir,
    cwd: materialsDir,
    processCwd: materialsDir,
    env: harnessChildEnv({ parent, dshHome, materialsDir, provider, facts, credential: options.credential, agentHome: options.agentId ? dshHome : null }),
    profile: 'sdk',
    patchPath: path.join(dshHome, 'patches', 'read-only-tools.v1.yml'),
    toolProfile: HARNESS_TOOL_PROFILE,
    ...(bin ? { dshBin: bin } : {}),
  };
}

/**
 * 把 patch 落到该 Agent 的 home。`persona` 是该修订的系统提示词（R32），
 * 写进 dsh-system-prompt 的 personaPrefix——这是让 Agent 人格进入模型的唯一通道。
 */
export function materializeHarnessHome(launch: HarnessLaunch, persona?: string | null): void {
  fs.mkdirSync(launch.materialsDir, { recursive: true });
  fs.mkdirSync(path.dirname(launch.patchPath), { recursive: true });
  const next = readOnlyToolPatch(persona);
  const current = fs.existsSync(launch.patchPath) ? fs.readFileSync(launch.patchPath, 'utf8') : '';
  if (current !== next) fs.writeFileSync(launch.patchPath, next, 'utf8');
}

export interface HarnessModelSelection { providerId?: string | null; modelId?: string | null }

/** One resolver for launch and release evidence, so a settings/key change invalidates tests. */
export function resolveHarnessConfiguration(options: HarnessLaunchOptions, agentId?: string | null, selection?: HarnessModelSelection) {
  const parent = options.parentEnv ?? process.env;
  const resolvedAgentId = agentId ?? options.agentId ?? null;
  const ownHome = resolvedAgentId ? agentHomeDir(options.modelDirectory?.homeDir() ?? resolveModelHomeDir(parent), resolvedAgentId) : null;
  const ownDefault = ownHome ? readSettingsObject(path.join(ownHome, 'settings.yaml'))['agent-default-model'] : null;
  const ownChoice = ownDefault && typeof ownDefault === 'object' && !Array.isArray(ownDefault)
    ? ownDefault as Record<string, unknown> : {};
  const snapshot = options.modelDirectory?.snapshot();
  const providerId = selection?.providerId ?? (typeof ownChoice.provider === 'string' ? ownChoice.provider : null)
    ?? snapshot?.defaultProvider ?? options.provider ?? DEFAULT_PROVIDER_FACTS.route;
  const selected = snapshot?.providers.find((item) => item.id === providerId);
  if (snapshot && !selected) throw new Error(`model provider unavailable: ${providerId}`);
  if (!snapshot && providerId !== (options.providerFacts ?? DEFAULT_PROVIDER_FACTS).route) {
    throw new Error(`model provider facts unavailable: ${providerId}`);
  }
  const facts: HarnessProviderFacts = selected ? {
    route: selected.id, settingsSection: selected.interfaceName,
    baseURL: selected.baseURL, api: selected.protocol, apiKeyRef: selected.apiKeyRef, models: selected.models,
  } : { ...(options.providerFacts ?? DEFAULT_PROVIDER_FACTS) };
  const ownSettings = ownHome ? readSettingsObject(path.join(ownHome, 'settings.yaml')) : {};
  const ownRoute = facts.settingsSection === 'llm-pi-ai'
    ? (ownSettings['llm-pi-ai'] as { providers?: Record<string, { apiKeyEnv?: unknown }> } | undefined)?.providers?.[providerId]
    : ownSettings[facts.settingsSection] as { apiKeyEnv?: unknown } | undefined;
  if (typeof ownRoute?.apiKeyEnv === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(ownRoute.apiKeyEnv)) {
    facts.apiKeyRef = ownRoute.apiKeyEnv;
  }
  // A revision without a provider is an explicit request to inherit the live
  // system choice. Its legacy modelId is only a draft placeholder, not a route.
  const model = (selection?.providerId ? selection.modelId : (typeof ownChoice.model === 'string' ? ownChoice.model : null))
    ?? snapshot?.defaultModel ?? options.model ?? 'deepseek-v4-flash';
  return { providerId, model, facts, ownHome, credential: providerCredential(facts, parent, options.credential, ownHome) };
}

/** Construct one runtime with the resolved Agent home, model and read-only profile. */
export function buildHarnessRuntimeFactory(
  options: HarnessLaunchOptions,
): (agentId?: string | null, persona?: string | null, selection?: HarnessModelSelection) => DeepSeekHarness {
  return (agentId?: string | null, persona?: string | null, selection?: HarnessModelSelection) => {
    const resolvedAgentId = agentId ?? options.agentId ?? null;
    const { providerId, model, facts } = resolveHarnessConfiguration(options, resolvedAgentId, selection);
    const launch = planHarnessLaunch({ ...options, agentId: resolvedAgentId, provider: providerId, model, providerFacts: facts });
    materializeHarnessHome(launch, persona);
    // 该 Agent 自己的 home（有 agentId 时才是 per-agent 目录）；
    // 它同时也是子进程的 dshHome，凭据优先从这里取（独立配置优先于全局）。
    // 复用 dsh 原生管理：提供方事实写进子进程 home 的 settings.yaml；凭据经 env 传入。
    syncProviderHome(launch.dshHome, facts);
    return new DeepSeekHarness({
      cwd: launch.cwd,
      provider: launch.provider,
      model: launch.model,
      profile: launch.profile,
      patches: [launch.patchPath],
      ...(launch.dshBin ? { dshBin: launch.dshBin } : {}),
      dshHome: launch.dshHome,
      processCwd: launch.processCwd,
      env: launch.env,
      requestTimeoutMs: 60_000,
    });
  };
}
