import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { READ_ONLY_PROFILE } from '@walker/shared';
import {
  DISABLED_HARNESS_PLUGINS,
  HARNESS_TOOL_PROFILE,
  buildHarnessRuntimeFactory,
  materializeHarnessHome,
  planHarnessLaunch,
  readOnlyToolPatch,
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

  it('显式凭据通道替换父进程里的同名密钥', () => {
    const launch = planHarnessLaunch({
      audience: 'public',
      parentEnv,
      homeDir: tempRoot(),
      credential: { envName: 'DEEPSEEK_API_KEY', value: 'sk-rotated' },
    });
    expect(launch.env.DEEPSEEK_API_KEY).toBe('sk-rotated');
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
