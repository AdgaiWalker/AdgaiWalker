import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { READ_ONLY_PROFILE } from '@walker/shared';
import { writeCredential } from './dsh-credentials-file';
import { FsModelDirectory } from '../adapters/fs-model-directory';
import {
  DEFAULT_PROVIDER_FACTS,
  DISABLED_HARNESS_PLUGINS,
  HARNESS_TOOL_PROFILE,
  buildHarnessRuntimeFactory,
  materializeHarnessHome,
  planHarnessLaunch,
  resolveHarnessConfiguration,
  readOnlyToolPatch,
  syncProviderHome,
} from './harness-launch';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-r10-'));
  roots.push(root);
  return root;
}

const parentEnv: NodeJS.ProcessEnv = {
  PATH: '/usr/bin',
  HOME: '/Users/tester',
  WALKER_ADMIN_TOKEN: 'admin-secret',
  WALKER_CREDENTIAL_MASTER_KEY: 'master-secret',
  DATABASE_URL: 'file:/secret/walker.db',
  UNRELATED_SENTINEL: 'leak',
  DEEPSEEK_API_KEY: 'sk-provider',
  DSH_PERMISSION_MODE: 'danger-full-access',
  DSH_HOME: '/tmp/should-not-inherit',
  DSH_TELEMETRY_ENABLED_OVERRIDE: '',
};

describe('Harness 启动环境', () => {
  it('子进程拿不到管理凭据、主密钥和无关变量', () => {
    const homeDir = tempRoot();
    const launch = planHarnessLaunch({ audience: 'public', parentEnv, homeDir });
    const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.env))'], {
      env: launch.env,
      encoding: 'utf8',
    });
    expect(child.status).toBe(0);
    const seen = JSON.parse(child.stdout) as Record<string, string>;
    expect(seen.WALKER_ADMIN_TOKEN).toBeUndefined();
    expect(seen.WALKER_CREDENTIAL_MASTER_KEY).toBeUndefined();
    expect(seen.DATABASE_URL).toBeUndefined();
    expect(seen.UNRELATED_SENTINEL).toBeUndefined();
    expect(seen.DSH_PERMISSION_MODE).toBeUndefined();
    expect(seen.DSH_HOME).toBe(launch.dshHome);
    expect(seen.DSH_HOME).not.toBe('/tmp/should-not-inherit');
    // 凭据经环境变量传入（名字由提供方目录声明）；home 里不落凭据文件
    expect(seen.DEEPSEEK_API_KEY).toBe('sk-provider');
    expect(seen.PATH).toBe('/usr/bin');
    expect(seen.DSH_TELEMETRY_DISABLED).toBe('1');
    expect(seen.WALKER_MATERIALS_DIR).toBe(launch.materialsDir);
    expect(launch.cwd).toBe(launch.materialsDir);
    expect(launch.processCwd).toBe(launch.materialsDir);
    expect(path.dirname(launch.materialsDir)).toBe(launch.dshHome);
  });

  it('前后台会话目录分开，覆盖路径不落到对方', () => {
    const homeDir = tempRoot();
    const publicHome = planHarnessLaunch({ audience: 'public', parentEnv, homeDir }).dshHome;
    const adminHome = planHarnessLaunch({ audience: 'admin', parentEnv, homeDir }).dshHome;
    expect(publicHome).toBe(path.join(homeDir, '.dsh-assistant'));
    expect(adminHome).toBe(path.join(homeDir, '.dsh-admin'));
    const pinned = planHarnessLaunch({
      audience: 'admin',
      parentEnv: { ...parentEnv, ASSISTANT_DSH_HOME: path.join(homeDir, 'public'), WALKER_DSH_ADMIN_HOME: path.join(homeDir, 'admin') },
      homeDir,
    });
    expect(pinned.dshHome).toBe(path.join(homeDir, 'admin'));
  });

  /**
   * 回归（本仓最贵的一个 bug）：SDK 的 dsh 定位器用 import.meta.resolve，
   * 而 dev 服务器跑在 tsx 下——esbuild 把 import.meta 换成 CommonJS shim，
   * import.meta.resolve 变成 undefined，于是每次 agent 运行都
   * 「TypeError: define_import_meta_default.resolve is not a function」→ FAILED runtime-error。
   *
   * 探针之所以一直通过，是因为它显式传了 WALKER_DSH_RUNTIME_BIN 绕过该行；
   * kernel 没传，于是 dev 下必炸。修复：显式给 dshBin（有 env 用 env，否则按包解析兜底）。
   */
  it('总是给出 dshBin：不再依赖 import.meta.resolve（dev/tsx 下必炸的那条路）', () => {
    const launch = planHarnessLaunch({ audience: 'admin', parentEnv, homeDir: tempRoot() });
    expect(launch.dshBin).toBeTruthy();
    expect(launch.dshBin).toContain('bin.js');
    expect(fs.existsSync(launch.dshBin as string)).toBe(true);
  });

  it('WALKER_DSH_RUNTIME_BIN 优先于兜底解析', () => {
    const pinned = '/opt/custom/dsh/bin.js';
    const launch = planHarnessLaunch({
      audience: 'admin',
      parentEnv: { ...parentEnv, WALKER_DSH_RUNTIME_BIN: pinned },
      homeDir: tempRoot(),
    });
    expect(launch.dshBin).toBe(pinned);
  });

  /**
   * 回归：不传 homeDir 时，受众级兜底目录必须落在 AdgaiWalker 自己的数据根，
   * 不能是 os.homedir()——否则会在站主家目录写出 ~/.dsh-admin / ~/.dsh-assistant
   * （R26 要求产品配置不与个人环境混用；实测已留下孤儿目录）。
   */
  it('不传 homeDir 时也不写到用户家目录（默认落在 AdgaiWalker 数据根）', () => {
    const modelHome = tempRoot();
    const parent = { ...parentEnv, WALKER_MODEL_HOME: modelHome };
    const admin = planHarnessLaunch({ audience: 'admin', parentEnv: parent });
    const publicHome = planHarnessLaunch({ audience: 'public', parentEnv: parent });
    expect(admin.dshHome.startsWith(modelHome)).toBe(true);
    expect(publicHome.dshHome.startsWith(modelHome)).toBe(true);
    expect(admin.dshHome.startsWith(os.homedir())).toBe(false);
    expect(publicHome.dshHome.startsWith(os.homedir())).toBe(false);
  });

  /**
   * 回归（R32）：Agent 提示词必须落到 dsh 的系统提示词通道。
   *
   * dsh 的 SDK 只有用户消息（协议原文 "sent verbatim as the user message"），
   * 系统提示由插件组装；官方入口是 dsh-system-prompt 的 personaPrefix。
   * 不写这段，Agent 跑的是 dsh 默认通用助手人格——后台配的提示词等于没配。
   */
  it('readOnlyToolPatch：给出 persona 时写进 system-prompt 的 personaPrefix', () => {
    const without = readOnlyToolPatch();
    expect(without).not.toContain('personaPrefix');
    expect(without).not.toContain('system-prompt');

    const patch = readOnlyToolPatch('你是小影，回答简洁。');
    expect(patch).toContain('- id: system-prompt');
    expect(patch).toContain('personaPrefix: |-');
    expect(patch).toContain('你是小影，回答简洁。');
    // 只读工具策略必须保持不变（不能因为加 persona 就放宽沙箱）
    expect(patch).toContain('- id: sandbox-policy');
    expect(patch).toContain('mode: read-only');
  });

  it('readOnlyToolPatch：多行提示词逐行缩进，保持为合法 YAML 字面块', () => {
    const patch = readOnlyToolPatch('第一行\n\n第三行');
    const lines = patch.split('\n');
    const start = lines.findIndex((line) => line.includes('personaPrefix: |-'));
    expect(start).toBeGreaterThan(-1);
    // 紧随其后的每一行都必须是 6 空格缩进（字面块内容）
    const body = lines.slice(start + 1, start + 4);
    expect(body[0]).toBe('      第一行');
    expect(body[2]).toBe('      第三行');
  });

  it('readOnlyToolPatch：空提示词不产生 persona 段', () => {
    expect(readOnlyToolPatch('')).not.toContain('personaPrefix');
    expect(readOnlyToolPatch('   ')).not.toContain('personaPrefix');
    expect(readOnlyToolPatch(null)).not.toContain('personaPrefix');
  });

  it('给定 agentId 时用该 Agent 的独立 home，Agent 之间互不串（R26）', () => {
    const root = tempRoot();
    const parent = { ...parentEnv, WALKER_MODEL_HOME: root };
    const a = planHarnessLaunch({ audience: 'admin', parentEnv: parent, homeDir: root, agentId: 'consultant' });
    const b = planHarnessLaunch({ audience: 'admin', parentEnv: parent, homeDir: root, agentId: 'engineer' });
    expect(a.dshHome).toBe(path.join(root, 'agents', 'consultant'));
    expect(b.dshHome).toBe(path.join(root, 'agents', 'engineer'));
    expect(a.dshHome).not.toBe(b.dshHome);
    // Agent home 挂在 AdgaiWalker 自己的 DSH_HOME 下，不落在站主个人 ~/.dsh
    expect(a.dshHome.startsWith(root)).toBe(true);
  });

  it('凭据文件里的 Key 会转发进子进程环境（后台配置界面写的就是这里）', () => {
    const root = tempRoot();
    writeCredential(root, 'DEEPSEEK_API_KEY', 'sk-from-file');
    const launch = planHarnessLaunch({
      audience: 'admin',
      // 父环境显式不带该 Key，只能来自凭据文件
      parentEnv: { ...parentEnv, WALKER_MODEL_HOME: root, DEEPSEEK_API_KEY: '' },
      homeDir: root,
    });
    expect(launch.env.DEEPSEEK_API_KEY).toBe('sk-from-file');
  });

  it('环境变量优先于凭据文件（部署时可用 env 覆盖）', () => {
    const root = tempRoot();
    writeCredential(root, 'DEEPSEEK_API_KEY', 'sk-from-file');
    const launch = planHarnessLaunch({
      audience: 'admin',
      parentEnv: { ...parentEnv, WALKER_MODEL_HOME: root, DEEPSEEK_API_KEY: 'sk-from-env' },
      homeDir: root,
    });
    expect(launch.env.DEEPSEEK_API_KEY).toBe('sk-from-env');
  });

  it('两处都没有凭据时不转发、不报错（如实缺失，由调用方决定降级）', () => {
    const root = tempRoot();
    const launch = planHarnessLaunch({
      audience: 'admin',
      parentEnv: { ...parentEnv, WALKER_MODEL_HOME: root, DEEPSEEK_API_KEY: '' },
      homeDir: root,
    });
    expect(launch.env.DEEPSEEK_API_KEY).toBeUndefined();
  });

  it('非法 agentId fail-closed：不允许穿越到共享层或他人 home', () => {
    const root = tempRoot();
    // 注意：空字符串语义是"未指定"，回落受众目录（见下一个用例），不属于非法
    for (const bad of ['../..', 'a/b', 'a b', 'x'.repeat(129)]) {
      expect(() =>
        planHarnessLaunch({
          audience: 'admin',
          parentEnv: { ...parentEnv, WALKER_MODEL_HOME: root },
          homeDir: root,
          agentId: bad,
        }),
      ).toThrow(/agent-id-unsafe/);
    }
  });

  it('未给 agentId 时保持受众级目录（R10 前后台分离行为不变）', () => {
    const root = tempRoot();
    const launch = planHarnessLaunch({ audience: 'public', parentEnv, homeDir: root });
    expect(launch.dshHome).toBe(path.join(root, '.dsh-assistant'));
  });

  it('syncProviderHome 保留式合并：写入 provider 段但不冲掉 Agent 自己的模型配置', () => {
    const home = tempRoot();
    fs.writeFileSync(
      path.join(home, 'settings.yaml'),
      ['agent-default-model:', '  provider: "deepseek-official"', '  model: "deepseek-v4.1-flash"', ''].join('\n'),
    );
    syncProviderHome(home, DEFAULT_PROVIDER_FACTS, null);
    const text = fs.readFileSync(path.join(home, 'settings.yaml'), 'utf8');
    expect(text).toContain('agent-default-model');
    expect(text).toContain('deepseek-v4.1-flash');
    expect(text).toContain('llm-deepseek');
    expect(text).toContain('DEEPSEEK_API_KEY');
  });

  it('Agent 的 Cordis profile 目录在它自己的 home 内（外部插件的落点）', () => {
    const root = tempRoot();
    const launch = planHarnessLaunch({
      audience: 'admin',
      parentEnv: { ...parentEnv, WALKER_MODEL_HOME: root },
      homeDir: root,
      agentId: 'consultant',
    });
    expect(launch.dshHome).toBe(path.join(root, 'agents', 'consultant'));
    // dsh 会在该 home 下生成 profiles/sdk（package.json 装该 Agent 独有插件）
    expect(path.join(launch.dshHome, 'profiles', 'sdk')).toBe(
      path.join(root, 'agents', 'consultant', 'profiles', 'sdk'),
    );
  });

  /**
   * 回归：Agent 自己的 Key 必须真的被运行时采用。
   *
   * 曾经的缺口：providerCredential 只读共享层 credentials.env，
   * 于是后台「每个 Agent 单独配 Key」只是把值存下来、运行时永远用不到——假功能。
   */
  it('Agent 自己的 Key 优先于共享层（独立配置真的生效）', () => {
    const root = tempRoot();
    const homeDir = path.join(root, 'agents', 'consultant');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.writeFileSync(path.join(homeDir, 'credentials.env'), 'DEEPSEEK_API_KEY=sk-agent-own\n');
    fs.writeFileSync(path.join(root, 'credentials.env'), 'DEEPSEEK_API_KEY=sk-shared\n');

    const factory = buildHarnessRuntimeFactory({
      audience: 'admin',
      parentEnv: { ...parentEnv, WALKER_MODEL_HOME: root },
      homeDir: root,
      providerFacts: { ...DEFAULT_PROVIDER_FACTS },
    });
    // 不启动子进程；launch.env 就是实际传给 SDK 的凭据环境。
    const launch = planHarnessLaunch({
      audience: 'admin',
      parentEnv: { ...parentEnv, WALKER_MODEL_HOME: root },
      homeDir: root,
      agentId: 'consultant',
      providerFacts: { ...DEFAULT_PROVIDER_FACTS },
    });
    expect(launch.dshHome).toBe(homeDir);
    expect(launch.env.DEEPSEEK_API_KEY).toBe('sk-agent-own');
    expect(typeof factory).toBe('function');
    // 该 Agent 的 home 里带着自己的 Key
    expect(fs.readFileSync(path.join(launch.dshHome, 'credentials.env'), 'utf8')).toContain('sk-agent-own');
  });

  it('修订选择的提供方和模型覆盖默认值，并读取该 Agent 路由的独立 Key', () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, 'settings.yaml'), 'agent-default-model:\n  provider: deepseek-official\n  model: deepseek-default\n');
    const home = path.join(root, 'agents', 'writer');
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'settings.yaml'), 'llm-pi-ai:\n  providers:\n    anthropic:\n      apiKeyEnv: WRITER_CLAUDE_KEY\n');
    fs.writeFileSync(path.join(home, 'credentials.env'), 'WRITER_CLAUDE_KEY=writer-secret\n');
    const config = resolveHarnessConfiguration({
      audience: 'admin', modelDirectory: new FsModelDirectory(root),
      parentEnv: { PATH: '/usr/bin' },
    }, 'writer', { providerId: 'anthropic', modelId: 'claude-revision' });
    expect(config.providerId).toBe('anthropic');
    expect(config.model).toBe('claude-revision');
    expect(config.facts.apiKeyRef).toBe('WRITER_CLAUDE_KEY');
    expect(config.credential).toEqual({ envName: 'WRITER_CLAUDE_KEY', value: 'writer-secret' });
    const launch = planHarnessLaunch({
      audience: 'admin', modelDirectory: new FsModelDirectory(root), parentEnv: { PATH: '/usr/bin' },
      agentId: 'writer', provider: config.providerId, model: config.model, providerFacts: config.facts,
    });
    expect(launch.dshHome).toBe(home);
    expect(launch.env.WRITER_CLAUDE_KEY).toBe('writer-secret');
  });

  it('未选择提供方的修订沿用当前系统默认模型，而不是旧草稿占位模型', () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, 'settings.yaml'), 'agent-default-model:\n  provider: openai\n  model: system-current\n');
    const config = resolveHarnessConfiguration({
      audience: 'admin', modelDirectory: new FsModelDirectory(root), parentEnv: { PATH: '/usr/bin' },
    }, 'unconfigured', { providerId: null, modelId: 'deepseek-flash' });
    expect(config.providerId).toBe('openai');
    expect(config.model).toBe('system-current');
  });

  it('Agent 没配自己的 Key 时回落共享层（可选全局）', () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, 'credentials.env'), 'DEEPSEEK_API_KEY=sk-shared\n');
    const launch = planHarnessLaunch({
      audience: 'admin',
      parentEnv: { ...parentEnv, WALKER_MODEL_HOME: root },
      homeDir: root,
      agentId: 'brand-new',
      providerFacts: { ...DEFAULT_PROVIDER_FACTS },
    });
    // 该 Agent 没有自己的凭据文件，但共享层那份仍在（运行时据此回落）
    expect(fs.existsSync(path.join(launch.dshHome, 'credentials.env'))).toBe(false);
    expect(launch.env.DEEPSEEK_API_KEY).toBe('sk-provider');
    expect(fs.readFileSync(path.join(root, 'credentials.env'), 'utf8')).toContain('sk-shared');
  });

  it('错误凭据名不会进入子进程，也不回退父进程密钥', () => {
    const launch = planHarnessLaunch({
      audience: 'public',
      parentEnv,
      homeDir: tempRoot(),
      credential: { envName: 'WALKER_ADMIN_TOKEN', value: 'admin-secret' },
    });
    expect(launch.env.WALKER_ADMIN_TOKEN).toBeUndefined();
    expect(launch.env.DEEPSEEK_API_KEY).toBeUndefined();
  });

  it('未知 provider 不转发 DeepSeek 密钥', () => {
    const launch = planHarnessLaunch({
      audience: 'admin',
      provider: 'other',
      parentEnv,
      homeDir: tempRoot(),
    });
    expect(launch.env.DEEPSEEK_API_KEY).toBeUndefined();
  });

  it('显式凭据经环境变量传入；home 里不写凭据文件（rc.3 有此文件即启动失败）', () => {
    const homeDir = tempRoot();
    const launch = planHarnessLaunch({
      audience: 'public',
      parentEnv,
      homeDir,
      providerFacts: { ...DEFAULT_PROVIDER_FACTS },
      credential: { envName: 'DEEPSEEK_API_KEY', value: 'sk-rotated' },
    });
    materializeHarnessHome(launch);
    syncProviderHome(launch.dshHome, DEFAULT_PROVIDER_FACTS, { envName: 'DEEPSEEK_API_KEY', value: 'sk-rotated' });
    expect(launch.env.DEEPSEEK_API_KEY).toBe('sk-rotated');
    expect(fs.existsSync(path.join(launch.dshHome, '.credentials.yaml'))).toBe(false);
  });

  it('历史残留的凭据文件会被清理（否则 rc.3 启动失败）', () => {
    const homeDir = tempRoot();
    const launch = planHarnessLaunch({ audience: 'public', parentEnv, homeDir });
    materializeHarnessHome(launch);
    fs.writeFileSync(path.join(launch.dshHome, '.credentials.yaml'), 'refs:\n  DEEPSEEK_API_KEY: "old"\n');
    syncProviderHome(launch.dshHome, DEFAULT_PROVIDER_FACTS, null);
    expect(fs.existsSync(path.join(launch.dshHome, '.credentials.yaml'))).toBe(false);
  });

  it('提供方事实（网址/引用名）写进 home 的 settings.yaml，扩展提供方不改代码', () => {
    const homeDir = tempRoot();
    const launch = planHarnessLaunch({ audience: 'public', parentEnv, homeDir });
    materializeHarnessHome(launch);
    syncProviderHome(
      launch.dshHome,
      {
        route: 'deepseek-official',
        settingsSection: 'llm-deepseek',
        baseURL: 'https://gateway.example.com/v1',
        apiKeyRef: 'MY_GATEWAY_KEY',
        models: [{ id: 'm1', name: '模型一' }],
      },
      null,
    );
    const settings = fs.readFileSync(path.join(launch.dshHome, 'settings.yaml'), 'utf8');
    expect(settings).toContain('llm-deepseek:');
    expect(settings).toContain('https://gateway.example.com/v1');
    expect(settings).toContain('MY_GATEWAY_KEY');
    expect(settings).toContain('m1');
    expect(settings).toContain('模型一');
  });

  it('遥测探针开关只决定是否关闭，本身不进入子进程', () => {
    const launch = planHarnessLaunch({
      audience: 'public',
      parentEnv: { ...parentEnv, DSH_TELEMETRY_ENABLED_OVERRIDE: '1' },
      homeDir: tempRoot(),
    });
    expect(launch.env.DSH_TELEMETRY_DISABLED).toBeUndefined();
    expect(launch.env.DSH_TELEMETRY_ENABLED_OVERRIDE).toBeUndefined();
  });
});

describe('只读工具 profile', () => {
  it('版本与关闭清单来自 patch 正文，而不是 DSH_PERMISSION_MODE', () => {
    const patch = readOnlyToolPatch();
    expect(patch).not.toContain('process.env.DSH_PERMISSION_MODE');
    expect(patch).not.toContain("name: '@deepseek-ai/dsh-mcp-client'");
    expect(patch).toContain('mode: read-only');
    expect(patch).toContain('policy: ask');
    for (const id of DISABLED_HARNESS_PLUGINS) {
      expect(patch).toContain(`- id: ${id}\n  disabled: true`);
    }
    expect(HARNESS_TOOL_PROFILE.id).toBe(READ_ONLY_PROFILE.id);
    expect(HARNESS_TOOL_PROFILE.version).toBe(READ_ONLY_PROFILE.version);
    expect(HARNESS_TOOL_PROFILE.configHash).toBe(createHash('sha256').update(patch).digest('hex'));
  });

  it('工厂把同一 patch 交给 SDK，且 SDK 看到的环境不含密钥', async () => {
    const homeDir = tempRoot();
    const launch = planHarnessLaunch({ audience: 'admin', parentEnv, homeDir });
    const harness = buildHarnessRuntimeFactory({ audience: 'admin', parentEnv, homeDir })();
    try {
      const options = harness.client.options as typeof harness.client.options & { cwd?: string };
      expect(options.profile).toBe('sdk');
      expect(options.patches).toEqual([launch.patchPath]);
      expect(options.cwd).toBe(launch.materialsDir);
      expect(options.processCwd).toBe(launch.materialsDir);
      expect(options.dshHome).toBe(launch.dshHome);
      expect(options.env).toEqual(launch.env);
      expect(options.env?.WALKER_ADMIN_TOKEN).toBeUndefined();
      expect(options.env?.WALKER_CREDENTIAL_MASTER_KEY).toBeUndefined();
      expect(options.env?.DATABASE_URL).toBeUndefined();
      expect(fs.readFileSync(launch.patchPath, 'utf8')).toBe(readOnlyToolPatch());
      expect(fs.statSync(launch.materialsDir).isDirectory()).toBe(true);
    } finally {
      await harness.close();
    }
  });

  it('重复物化不改写相同 patch', () => {
    const launch = planHarnessLaunch({ audience: 'public', parentEnv: { PATH: '/usr/bin' }, homeDir: tempRoot() });
    materializeHarnessHome(launch);
    const first = fs.statSync(launch.patchPath).mtimeMs;
    materializeHarnessHome(launch);
    expect(fs.readFileSync(launch.patchPath, 'utf8')).toBe(readOnlyToolPatch());
    expect(fs.statSync(launch.patchPath).mtimeMs).toBe(first);
  });
});
