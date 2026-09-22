/**
 * 公共 Harness 启动配方。
 * 子进程环境只保留启动所需变量和当前 provider 的一个凭据；
 * 工具面用 dsh-base 0.1.5-rc.2 的插件 id，按 sdk-app 的 patch 形式关闭。
 * sdk-minimal 仍挂持久 shell，不能当作只读隔离。
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client';
import { READ_ONLY_PROFILE } from '@walker/shared';

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

/** dsh-llm-deepseek 默认凭据引用。只转发这一项，不扫描其他 KEY/TOKEN。 */
const PROVIDER_CREDENTIAL_ENV = {
  'deepseek-official': 'DEEPSEEK_API_KEY',
} as const;

export type HarnessAudience = 'public' | 'admin';

export interface ProviderCredential {
  envName: string;
  value: string;
}

export interface HarnessLaunchOptions {
  audience: HarnessAudience;
  provider?: string;
  model?: string;
  credential?: ProviderCredential | null;
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

export function readOnlyToolPatch(): string {
  const lines = [
    '# Walker read-only tool profile. 沙箱模式是字面量 read-only。',
    '# 不插入 @deepseek-ai/dsh-mcp-client。',
    ...DISABLED_HARNESS_PLUGINS.flatMap((id) => [`- id: ${id}`, '  disabled: true']),
    '- id: sandbox-policy',
    '  config:',
    '    mode: read-only',
    '    workspaceRoot: !!js process.env.WALKER_MATERIALS_DIR',
    '- id: approval',
    '  config:',
    '    policy: ask',
    '',
  ];
  return lines.join('\n');
}

export const HARNESS_TOOL_PROFILE: HarnessToolProfile = {
  id: READ_ONLY_PROFILE.id,
  version: READ_ONLY_PROFILE.version,
  configHash: createHash('sha256').update(readOnlyToolPatch()).digest('hex'),
};

export function resolveSessionHome(audience: HarnessAudience, parent: NodeJS.ProcessEnv, homeDir: string): string {
  const override = audience === 'public' ? parent.ASSISTANT_DSH_HOME : parent.WALKER_DSH_ADMIN_HOME;
  const fallback = path.join(homeDir, audience === 'public' ? '.dsh-assistant' : '.dsh-admin');
  const raw = override?.trim();
  if (!raw) return fallback;
  return path.isAbsolute(raw) ? raw : path.resolve(homeDir, raw);
}

function readEnv(parent: NodeJS.ProcessEnv, name: string): string | undefined {
  const direct = parent[name];
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const target = name.toUpperCase();
  for (const [key, value] of Object.entries(parent)) {
    if (key.toUpperCase() === target && typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function providerCredential(
  provider: string,
  parent: NodeJS.ProcessEnv,
  explicit: ProviderCredential | null | undefined,
): ProviderCredential | null {
  const envName = PROVIDER_CREDENTIAL_ENV[provider as keyof typeof PROVIDER_CREDENTIAL_ENV];
  if (!envName) return null;
  if (explicit === null) return null;
  if (explicit) {
    if (explicit.envName !== envName || explicit.value.trim() === '') return null;
    return { envName, value: explicit.value };
  }
  const value = readEnv(parent, envName);
  return value ? { envName, value } : null;
}

export function harnessChildEnv(input: {
  parent: NodeJS.ProcessEnv;
  dshHome: string;
  materialsDir: string;
  provider: string;
  credential?: ProviderCredential | null;
}): Record<string, string> {
  const allowed = new Set<string>(PROCESS_ENV_ALLOWLIST.map((name) => name.toUpperCase()));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.parent)) {
    if (typeof value === 'string' && allowed.has(key.toUpperCase())) env[key] = value;
  }
  env.DSH_HOME = input.dshHome;
  env.WALKER_MATERIALS_DIR = input.materialsDir;
  if (!input.parent.DSH_TELEMETRY_ENABLED_OVERRIDE) env.DSH_TELEMETRY_DISABLED = '1';
  const credential = providerCredential(input.provider, input.parent, input.credential);
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
  const homeDir = options.homeDir ?? os.homedir();
  const provider = options.provider ?? 'deepseek-official';
  const model = options.model ?? 'deepseek-v4-flash';
  const dshHome = resolveSessionHome(options.audience, parent, homeDir);
  const materialsDir = options.materialsDir ? path.resolve(options.materialsDir) : path.join(dshHome, 'materials');
  const bin = readEnv(parent, 'WALKER_DSH_RUNTIME_BIN');
  return {
    audience: options.audience,
    provider,
    model,
    dshHome,
    materialsDir,
    cwd: materialsDir,
    processCwd: materialsDir,
    env: harnessChildEnv({ parent, dshHome, materialsDir, provider, credential: options.credential }),
    profile: 'sdk',
    patchPath: path.join(dshHome, 'patches', 'read-only-tools.v1.yml'),
    toolProfile: HARNESS_TOOL_PROFILE,
    ...(bin ? { dshBin: bin } : {}),
  };
}

export function materializeHarnessHome(launch: HarnessLaunch): void {
  fs.mkdirSync(launch.materialsDir, { recursive: true });
  fs.mkdirSync(path.dirname(launch.patchPath), { recursive: true });
  const next = readOnlyToolPatch();
  const current = fs.existsSync(launch.patchPath) ? fs.readFileSync(launch.patchPath, 'utf8') : '';
  if (current !== next) fs.writeFileSync(launch.patchPath, next, 'utf8');
}

export function buildHarnessRuntimeFactory(options: HarnessLaunchOptions): () => DeepSeekHarness {
  return () => {
    const launch = planHarnessLaunch(options);
    materializeHarnessHome(launch);
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
