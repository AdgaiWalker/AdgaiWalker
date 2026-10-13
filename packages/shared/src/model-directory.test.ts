import { describe, expect, it } from 'vitest';
import {
  KNOWN_PROVIDER_INTERFACES,
  buildAgentModelCatalog,
  findProvider,
  parseModelDirectory,
  parseModelDirectoryModels,
  pickUsableProvider,
  findWireProtocol,
  modelPresetsFor,
} from './model-directory.js';

const base = { home: '/Users/tester/.dsh', now: '2026-09-23T00:00:00.000Z' };

describe('parseModelDirectory（复用 dsh 原生管理）', () => {
  it('无配置时给出接口默认网址与默认引用名，凭据按 refs 判定', () => {
    const snap = parseModelDirectory({ settings: {}, credentialRefs: ['DEEPSEEK_API_KEY'], ...base });
    const provider = findProvider(snap, 'deepseek-official')!;
    expect(provider.interfaceName).toBe('llm-deepseek');
    expect(provider.baseURL).toBe('https://api.deepseek.com');
    expect(provider.apiKeyRef).toBe('DEEPSEEK_API_KEY');
    expect(provider.hasCredential).toBe(true);
    expect(provider.models).toEqual([]);
    expect(snap.defaultProvider).toBeNull();
    expect(snap.defaultModel).toBeNull();
  });

  it('settings 段可覆盖 API 网址、引用名与模型目录（id 及名称）', () => {
    const snap = parseModelDirectory({
      settings: {
        'llm-deepseek': {
          baseURL: 'https://gateway.example.com/v1',
          apiKeyEnv: 'MY_GATEWAY_KEY',
          models: [
            { id: 'deepseek-v4-flash', name: 'V4 Flash' },
            { id: 'deepseek-v4-pro', name: 'V4 Pro' },
          ],
        },
        'agent-default-model': { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      },
      credentialRefs: ['MY_GATEWAY_KEY', 'DEEPSEEK_API_KEY'],
      ...base,
    });
    const provider = findProvider(snap, 'deepseek-official')!;
    expect(provider.baseURL).toBe('https://gateway.example.com/v1');
    expect(provider.apiKeyRef).toBe('MY_GATEWAY_KEY');
    expect(provider.hasCredential).toBe(true);
    expect(provider.models).toEqual([
      { id: 'deepseek-v4-flash', name: 'V4 Flash' },
      { id: 'deepseek-v4-pro', name: 'V4 Pro' },
    ]);
    expect(snap.defaultProvider).toBe('deepseek-official');
    expect(snap.defaultModel).toBe('deepseek-v4-flash');
  });

  it('pi-ai 各路由从 providers.<route> 独立读取', () => {
    const snap = parseModelDirectory({
      settings: { 'llm-pi-ai': { providers: {
        anthropic: { apiKeyEnv: 'CLAUDE_KEY', baseURL: 'https://claude.example', models: [{ id: 'claude-x' }] },
        openai: { apiKeyEnv: 'OPENAI_KEY', models: [{ id: 'gpt-x' }] },
      } } },
      credentialRefs: ['CLAUDE_KEY'], ...base,
    });
    expect(findProvider(snap, 'anthropic')).toMatchObject({ baseURL: 'https://claude.example', apiKeyRef: 'CLAUDE_KEY', hasCredential: true, models: [{ id: 'claude-x', name: 'claude-x' }] });
    expect(findProvider(snap, 'openai')).toMatchObject({ apiKeyRef: 'OPENAI_KEY', hasCredential: false, models: [{ id: 'gpt-x', name: 'gpt-x' }] });
  });

  it('引用名不在凭据文档里时 hasCredential=false（不猜测、不读值）', () => {
    const snap = parseModelDirectory({
      settings: { 'llm-deepseek': { apiKeyEnv: 'MISSING_KEY' } },
      credentialRefs: ['DEEPSEEK_API_KEY'],
      ...base,
    });
    expect(findProvider(snap, 'deepseek-official')!.hasCredential).toBe(false);
  });

  it('坏形状 fail-closed：settings 非对象、段非对象、模型项缺 id 都被跳过', () => {
    const snap = parseModelDirectory({ settings: 'not-an-object', credentialRefs: [], ...base });
    expect(findProvider(snap, 'deepseek-official')!.baseURL).toBe('https://api.deepseek.com');

    const bad = parseModelDirectory({
      settings: { 'llm-deepseek': { baseURL: 42, apiKeyEnv: null, models: 'nope' } },
      credentialRefs: [],
      ...base,
    });
    const provider = findProvider(bad, 'deepseek-official')!;
    expect(provider.baseURL).toBe('https://api.deepseek.com');
    expect(provider.apiKeyRef).toBe('DEEPSEEK_API_KEY');
    expect(provider.models).toEqual([]);
  });

  it('模型目录去重、名称缺省回落到 id', () => {
    const models = parseModelDirectoryModels([
      { id: 'a' },
      { id: 'a', name: '重复' },
      { id: 'b', name: '  ' },
      { name: '无 id' },
      null,
    ]);
    expect(models).toEqual([
      { id: 'a', name: 'a' },
      { id: 'b', name: 'b' },
    ]);
  });

  it('接口登记唯一一份，新增提供方走这里', () => {
    const routes = KNOWN_PROVIDER_INTERFACES.map((i) => i.route);
    expect(new Set(routes).size).toBe(routes.length);
    expect(routes).toContain('deepseek-official');
  });
});

describe('pickUsableProvider（显式 > 默认 > 首个有凭据）', () => {
  const snap = (refs: string[], settings: Record<string, unknown> = {}) =>
    parseModelDirectory({ settings, credentialRefs: refs, ...base });

  it('显式指定且该提供方有凭据才返回', () => {
    const withKey = snap(['DEEPSEEK_API_KEY']);
    expect(pickUsableProvider(withKey, { provider: 'deepseek-official', model: 'm1' })).toEqual({
      provider: expect.objectContaining({ id: 'deepseek-official' }),
      model: 'm1',
    });
    const withoutKey = snap([]);
    expect(pickUsableProvider(withoutKey, { provider: 'deepseek-official' })).toBeNull();
  });

  it('无显式指定时取 dsh 默认模型；默认提供方无凭据则回落到首个有凭据者', () => {
    const usingDefault = snap(['DEEPSEEK_API_KEY'], {
      'agent-default-model': { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    });
    expect(pickUsableProvider(usingDefault)?.model).toBe('deepseek-v4-flash');

    const noCredentialAtAll = snap([]);
    expect(pickUsableProvider(noCredentialAtAll)).toBeNull();
  });

  it('默认提供方不是已知接口时，不猜测，回落到有凭据的已知接口', () => {
    const foreign = snap(['DEEPSEEK_API_KEY'], {
      'agent-default-model': { provider: 'some-desktop-only-provider', model: 'glm-5.3' },
    });
    const picked = pickUsableProvider(foreign);
    expect(picked?.provider.id).toBe('deepseek-official');
  });
});

describe('buildAgentModelCatalog（管理端 Agent 编辑用的目录）', () => {
  it('提供方带接口/网址/凭据状态；默认提供方标记，且默认模型必在列', () => {
    const snapshot = parseModelDirectory({
      settings: { 'agent-default-model': { provider: 'deepseek-official', model: 'deepseek-flash' } },
      credentialRefs: ['DEEPSEEK_API_KEY'],
      ...base,
    });
    const catalog = buildAgentModelCatalog(snapshot);
    expect(catalog.source).toBe('dsh');
    expect(catalog.home).toBe('/Users/tester/.dsh');
    expect(catalog.defaultProvider).toBe('deepseek-official');
    const provider = catalog.providers[0]!;
    expect(provider.id).toBe('deepseek-official');
    expect(provider.interfaceName).toBe('llm-deepseek');
    expect(provider.baseURL).toBe('https://api.deepseek.com');
    expect(provider.apiKeyRef).toBe('DEEPSEEK_API_KEY');
    expect(provider.hasCredential).toBe(true);
    expect(provider.isDefault).toBe(true);
    expect(provider.models).toEqual([{ id: 'deepseek-flash', name: 'deepseek-flash' }]);
  });

  it('声明了目录时以声明为准，默认模型不重复插入', () => {
    const snapshot = parseModelDirectory({
      settings: {
        'llm-deepseek': { models: [{ id: 'deepseek-flash', name: 'V4 Flash' }, { id: 'm2', name: '模型二' }] },
        'agent-default-model': { provider: 'deepseek-official', model: 'deepseek-flash' },
      },
      credentialRefs: [],
      ...base,
    });
    const provider = buildAgentModelCatalog(snapshot).providers[0]!;
    expect(provider.isDefault).toBe(true);
    expect(provider.hasCredential).toBe(false);
    expect(provider.models.map((m) => m.id)).toEqual(['deepseek-flash', 'm2']);
  });

  it('默认提供方不是已支持接口时，不伪造 isDefault', () => {
    const snapshot = parseModelDirectory({
      settings: { 'agent-default-model': { provider: 'workbuddy', model: 'glm-5.3' } },
      credentialRefs: ['DEEPSEEK_API_KEY'],
      ...base,
    });
    const provider = buildAgentModelCatalog(snapshot).providers[0]!;
    expect(provider.isDefault).toBe(false);
    expect(provider.models).toEqual([]);
  });
});

describe('线协议与预置模型（多提供方）', () => {
  it('每个登记提供方都带协议，且协议值在 WIRE_PROTOCOLS 中', () => {
    const snapshot = parseModelDirectory({ settings: {}, credentialRefs: [], ...base });
    expect(snapshot.providers.length).toBeGreaterThan(1);
    for (const provider of snapshot.providers) {
      expect(findWireProtocol(provider.protocol), provider.id).not.toBeNull();
    }
  });

  it('DeepSeek 直连是 OpenAI 协议；Anthropic 路由是 Claude 原生协议', () => {
    const snapshot = parseModelDirectory({ settings: {}, credentialRefs: [], ...base });
    const byId = new Map(snapshot.providers.map((p) => [p.id, p]));
    expect(byId.get('deepseek-official')!.protocol).toBe('openai-completions');
    expect(byId.get('anthropic')!.protocol).toBe('anthropic-messages');
  });

  it('settings 里显式写的 api 覆盖目录默认协议', () => {
    const snapshot = parseModelDirectory({
      settings: { 'llm-deepseek': { api: 'anthropic-messages' } },
      credentialRefs: [],
      ...base,
    });
    expect(snapshot.providers[0]!.protocol).toBe('anthropic-messages');
  });

  it('settings 里非法的 api 不被采信，回落目录默认（fail-closed）', () => {
    const snapshot = parseModelDirectory({
      settings: { 'llm-deepseek': { api: 'not-a-protocol' } },
      credentialRefs: [],
      ...base,
    });
    expect(snapshot.providers[0]!.protocol).toBe('openai-completions');
  });

  it('admin 目录视图给出协议与可读名', () => {
    const snapshot = parseModelDirectory({ settings: {}, credentialRefs: [], ...base });
    const provider = buildAgentModelCatalog(snapshot).providers.find((p) => p.id === 'anthropic')!;
    expect(provider.protocol).toBe('anthropic-messages');
    expect(provider.protocolLabel).toContain('Anthropic');
  });

  it('每个有预置的提供方，预置模型数恰好 3 个且协议合法', () => {
    for (const known of KNOWN_PROVIDER_INTERFACES) {
      const presets = modelPresetsFor(known.route);
      expect(presets.length, known.route).toBe(3);
      for (const preset of presets) {
        expect(findWireProtocol(preset.protocol), preset.id).not.toBeNull();
        expect(preset.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('DeepSeek 预置如实标注已下线型号，且不与在服务型号混淆', () => {
    const presets = modelPresetsFor('deepseek-official');
    expect(presets.map((p) => p.id)).toEqual([
      'deepseek-flash',
      'deepseek-v4-pro',
      'deepseek-v4-flash-vision-exp',
    ]);
    const retired = presets.find((p) => p.id === 'deepseek-v4-flash-vision-exp')!;
    expect(retired.note).toContain('已下线');
    // 在服务的最新型号不该被标成已下线
    expect(presets.find((p) => p.id === 'deepseek-flash')!.note ?? '').not.toContain('已下线');
  });

  it('未登记的提供方没有预置（界面仍允许手填）', () => {
    expect(modelPresetsFor('not-registered')).toEqual([]);
  });
});
