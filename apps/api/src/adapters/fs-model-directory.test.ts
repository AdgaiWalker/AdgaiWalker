import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FsModelDirectory, resolveModelHomeDir } from './fs-model-directory';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

/** 凭据真相源是 credentials.env（KEY=value），不是 dsh 的 .credentials.yaml。 */
function home(files: { settings?: string; credentials?: string }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-model-dir-'));
  roots.push(dir);
  if (files.settings !== undefined) fs.writeFileSync(path.join(dir, 'settings.yaml'), files.settings);
  if (files.credentials !== undefined) fs.writeFileSync(path.join(dir, 'credentials.env'), files.credentials);
  return dir;
}

describe('resolveModelHomeDir（= AdgaiWalker 自己的环境）', () => {
  it('WALKER_MODEL_HOME 优先；**不回落**站主个人环境（~/.dsh / DSH_HOME）', () => {
    expect(resolveModelHomeDir({ WALKER_MODEL_HOME: '/srv/model' })).toBe('/srv/model');
    expect(resolveModelHomeDir({ DSH_HOME: '/Users/tester/.dsh' })).not.toBe('/Users/tester/.dsh');
    expect(resolveModelHomeDir({})).not.toBe(path.join(os.homedir(), '.dsh'));
  });
});

describe('agentHome（每个 Agent 独立环境，R26）', () => {
  it('共享层 + Agent 覆盖层：模型各自配置、凭据默认共用', () => {
    const dir = home({
      settings: ['llm-deepseek:', '  apiKeyEnv: "DEEPSEEK_API_KEY"', ''].join('\n'),
      credentials: 'DEEPSEEK_API_KEY=shared-value\n',
    });
    fs.mkdirSync(path.join(dir, 'agents', 'consultant'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'agents', 'consultant', 'settings.yaml'),
      ['agent-default-model:', '  provider: "deepseek-official"', '  model: "deepseek-v4.1-flash"', ''].join('\n'),
    );
    const view = new FsModelDirectory(dir).agentHome('consultant');
    expect(view.homeDir).toBe(dir + '/agents/consultant');
    expect(view.profileDir).toBe(dir + '/agents/consultant/profiles/sdk');
    expect(view.hasOwnSettings).toBe(true);
    expect(view.defaultModel).toBe('deepseek-v4.1-flash');
    expect(view.apiKeyRef).toBe('DEEPSEEK_API_KEY');
    expect(view.hasCredential).toBe(true);
    expect(JSON.stringify(view)).not.toContain('shared-value');
  });

  it('不同 Agent 的配置互不串', () => {
    const dir = home({
      settings: ['llm-deepseek:', '  apiKeyEnv: "DEEPSEEK_API_KEY"', ''].join('\n'),
      credentials: 'DEEPSEEK_API_KEY=v\n',
    });
    for (const id of ['a', 'b']) {
      fs.mkdirSync(path.join(dir, 'agents', id), { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'agents', id, 'settings.yaml'),
        'agent-default-model:\n  provider: "p"\n  model: "' + (id === 'a' ? 'deepseek-v4.1-flash' : 'gpt-5.6') + '"\n',
      );
    }
    const adapter = new FsModelDirectory(dir);
    expect(adapter.agentHome('a').defaultModel).toBe('deepseek-v4.1-flash');
    expect(adapter.agentHome('b').defaultModel).toBe('gpt-5.6');
    expect(adapter.agentHome('a').homeDir).not.toBe(adapter.agentHome('b').homeDir);
  });

  it('未建目录的 Agent 回落共享层（标记 hasOwnSettings=false）', () => {
    const dir = home({
      settings: [
        'llm-deepseek:',
        '  apiKeyEnv: "DEEPSEEK_API_KEY"',
        'agent-default-model:',
        '  provider: "deepseek-official"',
        '  model: "deepseek-flash"',
        '',
      ].join('\n'),
      credentials: 'DEEPSEEK_API_KEY=v\n',
    });
    const view = new FsModelDirectory(dir).agentHome('brand-new');
    expect(view.hasOwnSettings).toBe(false);
    expect(view.defaultModel).toBe('deepseek-flash');
    expect(view.hasCredential).toBe(true);
  });

  it('非法 agentId fail-closed（不允许穿越到共享层）', () => {
    const dir = home({ settings: '', credentials: '' });
    expect(() => new FsModelDirectory(dir).agentHome('../..')).toThrow(/agent-id-unsafe/);
  });
});

describe('FsModelDirectory（读 dsh 原生管理）', () => {
  it('settings 段 + 凭据引用归一成目录快照', () => {
    const dir = home({
      settings: [
        'llm-deepseek:',
        '  baseURL: "https://gateway.example.com/v1"',
        '  apiKeyEnv: "GW_KEY"',
        '  models:',
        '    - id: "m1"',
        '      name: "模型一"',
        'agent-default-model:',
        '  provider: "deepseek-official"',
        '  model: "m1"',
      ].join('\n'),
      credentials: 'GW_KEY=hidden-value\n',
    });
    const snapshot = new FsModelDirectory(dir).snapshot();
    expect(snapshot.home).toBe(dir);
    expect(snapshot.defaultProvider).toBe('deepseek-official');
    expect(snapshot.defaultModel).toBe('m1');
    const provider = snapshot.providers[0]!;
    expect(provider.baseURL).toBe('https://gateway.example.com/v1');
    expect(provider.apiKeyRef).toBe('GW_KEY');
    expect(provider.hasCredential).toBe(true);
    expect(provider.models).toEqual([{ id: 'm1', name: '模型一' }]);
    // 快照里绝不出现凭据值
    expect(JSON.stringify(snapshot)).not.toContain('hidden-value');
  });

  it('缺文件 fail-closed：给接口默认值，标记无凭据', () => {
    const dir = home({});
    const snapshot = new FsModelDirectory(dir).snapshot();
    const provider = snapshot.providers[0]!;
    expect(provider.baseURL).toBe('https://api.deepseek.com');
    expect(provider.apiKeyRef).toBe('DEEPSEEK_API_KEY');
    expect(provider.hasCredential).toBe(false);
    expect(snapshot.defaultProvider).toBeNull();
  });

  it('坏 YAML / 坏形状不抛异常，按未配置处理', () => {
    const broken = home({ settings: 'llm-deepseek: [unclosed', credentials: ': : bad\nnot a key line\n=oops\n' });
    const snapshot = new FsModelDirectory(broken).snapshot();
    expect(snapshot.providers[0]!.hasCredential).toBe(false);
  });

  it('credentialValue 只返回该引用的值；无引用返回 null', () => {
    const dir = home({ credentials: 'A_KEY=value-a\nB_KEY=value-b\n' });
    const adapter = new FsModelDirectory(dir);
    expect(adapter.credentialValue('A_KEY')).toBe('value-a');
    expect(adapter.credentialValue('MISSING')).toBeNull();
  });

  it('credentialRevision 稳定且随值变化；无值返回 null', () => {
    const dir = home({ credentials: 'A_KEY=value-a\n' });
    const adapter = new FsModelDirectory(dir);
    const first = adapter.credentialRevision('A_KEY');
    expect(first).toBe(adapter.credentialRevision('A_KEY'));
    expect(first).toMatch(/^[a-f0-9]{16}$/);
    expect(first).not.toContain('value-a');
    expect(adapter.credentialRevision('MISSING')).toBeNull();

    fs.writeFileSync(path.join(dir, 'credentials.env'), 'A_KEY=value-b\n');
    expect(new FsModelDirectory(dir).credentialRevision('A_KEY')).not.toBe(first);
  });

  /**
   * 回归：后台目录快照的 hasCredential 必须与运行时真实读凭据一致。
   *
   * 曾经的缺陷：snapshot 只读 dsh 的 .credentials.yaml（rc.3 下这个文件被刻意删掉），
   * 而运行时读的是 credentials.env —— 于是设置页显示「已配置」、Agent 编辑页却显示
   * 「未配置凭据」，pickUsableProvider 也永远返回 null 导致静默换提供方。
   * 两边必须同源。
   */
  it('hasCredential 与 credentialValue 同源（后台显示 == 运行时可用）', () => {
    const dir = home({
      settings: ['llm-deepseek:', '  apiKeyEnv: "DEEPSEEK_API_KEY"', ''].join('\n'),
      credentials: 'DEEPSEEK_API_KEY=real-value\n',
    });
    const adapter = new FsModelDirectory(dir);
    const provider = adapter.snapshot().providers[0]!;
    expect(provider.hasCredential).toBe(true);                    // 界面判定
    expect(adapter.credentialValue(provider.apiKeyRef)).toBe('real-value'); // 运行时取值
  });

  it('删除凭据后两边同时变为不可用（不会一边真一边假）', () => {
    const dir = home({
      settings: ['llm-deepseek:', '  apiKeyEnv: "DEEPSEEK_API_KEY"', ''].join('\n'),
      credentials: 'DEEPSEEK_API_KEY=real-value\n',
    });
    fs.writeFileSync(path.join(dir, 'credentials.env'), '# 清空\n');
    const adapter = new FsModelDirectory(dir);
    expect(adapter.snapshot().providers[0]!.hasCredential).toBe(false);
    expect(adapter.credentialValue('DEEPSEEK_API_KEY')).toBeNull();
  });

  it('残留的 dsh .credentials.yaml 不影响判定（值不在那里）', () => {
    const dir = home({
      settings: ['llm-deepseek:', '  apiKeyEnv: "DEEPSEEK_API_KEY"', ''].join('\n'),
      credentials: 'DEEPSEEK_API_KEY=real-value\n',
    });
    fs.writeFileSync(path.join(dir, '.credentials.yaml'), 'refs:\n  DEEPSEEK_API_KEY: "stale"\n');
    const adapter = new FsModelDirectory(dir);
    expect(adapter.snapshot().providers[0]!.hasCredential).toBe(true);
    expect(adapter.credentialValue('DEEPSEEK_API_KEY')).toBe('real-value');
  });
});
