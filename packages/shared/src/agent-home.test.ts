import { describe, expect, it } from 'vitest';
import {
  agentHomeDir,
  agentProfileDir,
  isSafeAgentId,
  resolveAgentHome,
} from './agent-home.js';

const root = '/srv/adgaiwalker/apps/api/data/dsh-home';

describe('Agent 独立 home（R26）', () => {
  it('每个 Agent 一个目录，彼此隔离；profile 在各自 home 内', () => {
    expect(agentHomeDir(root, 'consultant')).toBe(`${root}/agents/consultant`);
    expect(agentHomeDir(root, 'engineer')).toBe(`${root}/agents/engineer`);
    expect(agentProfileDir(root, 'engineer')).toBe(`${root}/agents/engineer/profiles/sdk`);
    // 末尾斜杠不产生双斜杠
    expect(agentHomeDir(`${root}/`, 'a')).toBe(`${root}/agents/a`);
  });

  it('非法 agentId fail-closed：不允许路径穿越或分隔符', () => {
    for (const bad of ['../..', 'a/b', 'a\\b', '', '.', 'a b', 'x'.repeat(129)]) {
      expect(isSafeAgentId(bad)).toBe(false);
      expect(() => agentHomeDir(root, bad)).toThrow(/agent-id-unsafe/);
    }
    expect(isSafeAgentId('consultant-1_b')).toBe(true);
  });

  it('Agent 层覆盖共享层：模型各自不同（a 用 flash、b 用别的）', () => {
    const shared = { 'llm-deepseek': { apiKeyEnv: 'DEEPSEEK_API_KEY' } };
    const a = resolveAgentHome({
      rootHome: root,
      agentId: 'consultant',
      sharedSettings: shared,
      agentSettings: { 'agent-default-model': { provider: 'deepseek-official', model: 'deepseek-v4.1-flash' } },
      sharedCredentialRefs: ['DEEPSEEK_API_KEY'],
    });
    const b = resolveAgentHome({
      rootHome: root,
      agentId: 'engineer',
      sharedSettings: shared,
      agentSettings: { 'agent-default-model': { provider: 'openai', model: 'gpt-5.6' } },
      sharedCredentialRefs: ['DEEPSEEK_API_KEY'],
    });
    expect(a.defaultModel).toBe('deepseek-v4.1-flash');
    expect(b.defaultModel).toBe('gpt-5.6');
    expect(a.homeDir).not.toBe(b.homeDir);
    // 共用一份凭据：都没单独指定引用名时，都用共享层的
    expect(a.apiKeyRef).toBe('DEEPSEEK_API_KEY');
    expect(b.apiKeyRef).toBe('DEEPSEEK_API_KEY');
    expect(a.hasCredential).toBe(true);
  });

  it('Agent 可单独指定凭据引用（共用为默认，单独配置也可行）', () => {
    const view = resolveAgentHome({
      rootHome: root,
      agentId: 'engineer',
      sharedSettings: { 'llm-deepseek': { apiKeyEnv: 'DEEPSEEK_API_KEY' } },
      agentSettings: { 'llm-deepseek': { apiKeyEnv: 'ENGINEER_OWN_KEY' } },
      sharedCredentialRefs: ['DEEPSEEK_API_KEY'],
      agentCredentialRefs: ['ENGINEER_OWN_KEY'],
    });
    expect(view.apiKeyRef).toBe('ENGINEER_OWN_KEY');
    expect(view.hasCredential).toBe(true);
  });

  it('没有自己的 settings 时标记 hasOwnSettings=false，并回落共享层', () => {
    const view = resolveAgentHome({
      rootHome: root,
      agentId: 'fresh',
      sharedSettings: {
        'llm-deepseek': { apiKeyEnv: 'DEEPSEEK_API_KEY' },
        'agent-default-model': { provider: 'deepseek-official', model: 'deepseek-flash' },
      },
      agentSettings: null,
      sharedCredentialRefs: ['DEEPSEEK_API_KEY'],
    });
    expect(view.hasOwnSettings).toBe(false);
    expect(view.defaultProvider).toBe('deepseek-official');
    expect(view.defaultModel).toBe('deepseek-flash');
  });

  it('引用没有对应值时不谎报 hasCredential', () => {
    const view = resolveAgentHome({
      rootHome: root,
      agentId: 'engineer',
      sharedSettings: { 'llm-deepseek': { apiKeyEnv: 'ENGINEER_OWN_KEY' } },
      agentSettings: {},
      sharedCredentialRefs: ['DEEPSEEK_API_KEY'],
    });
    expect(view.apiKeyRef).toBe('ENGINEER_OWN_KEY');
    expect(view.hasCredential).toBe(false);
  });

  it('坏输入不抛异常：settings 非对象按未配置处理', () => {
    const view = resolveAgentHome({
      rootHome: root,
      agentId: 'a',
      sharedSettings: 'not-an-object',
      agentSettings: 42,
      sharedCredentialRefs: [],
    });
    expect(view.defaultProvider).toBeNull();
    expect(view.defaultModel).toBeNull();
    expect(view.apiKeyRef).toBeNull();
    expect(view.hasCredential).toBe(false);
  });
});
