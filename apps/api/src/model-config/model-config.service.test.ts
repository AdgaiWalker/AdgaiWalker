import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FsModelDirectory } from '../adapters/fs-model-directory';
import { FsModelCredential } from '../adapters/fs-model-credential';
import { ModelConfigService } from './model-config.service';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

/** 一个临时 Harness 主目录 + 预置凭据。 */
function makeService(files: { settings?: string; credentials?: string } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-model-config-'));
  roots.push(dir);
  if (files.settings !== undefined) fs.writeFileSync(path.join(dir, 'settings.yaml'), files.settings);
  if (files.credentials !== undefined) fs.writeFileSync(path.join(dir, 'credentials.env'), files.credentials);
  return {
    dir,
    service: new ModelConfigService(new FsModelDirectory(dir), new FsModelCredential(dir)),
    settings: () => fs.readFileSync(path.join(dir, 'settings.yaml'), 'utf8'),
  };
}

const DEEPSEEK_SETTINGS = [
  'llm-deepseek:',
  '  apiKeyEnv: DEEPSEEK_API_KEY',
  '  baseURL: https://api.deepseek.com',
  '',
].join('\n');

describe('ModelConfigService（模型连接配置）', () => {
  it('read：列出全部提供方与协议，响应不含凭据值', () => {
    const { service } = makeService({
      settings: DEEPSEEK_SETTINGS,
      credentials: 'DEEPSEEK_API_KEY=secret-value\n',
    });
    const view = service.read();
    expect(view.providers.length).toBeGreaterThan(1);
    const deepseek = view.providers.find((p) => p.id === 'deepseek-official')!;
    expect(deepseek.protocol).toBe('openai-completions');
    expect(deepseek.protocolLabel).toContain('OpenAI');
    expect(deepseek.hasCredential).toBe(true);
    // 响应绝不泄露凭据值
    expect(JSON.stringify(view)).not.toContain('secret-value');
    // 协议清单与预置都在
    expect(view.protocols.length).toBeGreaterThan(5);
    expect(view.presetsByProvider.find((x) => x.providerId === 'deepseek-official')!.presets).toHaveLength(3);
  });

  it('save：未连接供应商的保存**不夺走**已有的全局默认', () => {
    const { service, settings } = makeService({
      settings: DEEPSEEK_SETTINGS,
      credentials: 'DEEPSEEK_API_KEY=secret-value\n',
    });
    // 先把 DeepSeek 设为默认（它有凭据）
    service.save({ providerId: 'deepseek-official', baseURL: 'https://api.deepseek.com', models: [{ id: 'deepseek-flash', name: 'F' }] });
    expect(service.read().defaultProvider).toBe('deepseek-official');

    // 再保存一家**没有凭据**的提供方——默认必须还是 DeepSeek
    service.save({ providerId: 'anthropic', baseURL: 'https://api.anthropic.com', models: [{ id: 'claude-sonnet-5', name: 'S5' }] });
    expect(service.read().defaultProvider).toBe('deepseek-official');
    expect(settings()).toContain('llm-pi-ai:');
  });

  it('save：pi-ai 路由写进 llm-pi-ai.providers.<route> 嵌套结构', () => {
    const { service, settings } = makeService({ settings: DEEPSEEK_SETTINGS });
    service.save({ providerId: 'anthropic', baseURL: 'https://api.anthropic.com', models: [{ id: 'claude-sonnet-5', name: 'Claude Sonnet 5' }] });
    const text = settings();
    expect(text).toContain('llm-pi-ai:');
    expect(text).toContain('providers:');
    expect(text).toContain('anthropic:');
    expect(text).toContain('claude-sonnet-5');
    service.save({ providerId: 'openai', baseURL: 'https://api.openai.com/v1', models: [{ id: 'gpt-test', name: 'GPT' }] });
    expect(settings()).toContain('anthropic:');
    expect(service.read().providers.find((p) => p.id === 'anthropic')?.models[0]?.id).toBe('claude-sonnet-5');
    expect(service.read().providers.find((p) => p.id === 'openai')?.models[0]?.id).toBe('gpt-test');
  });

  it('save：默认协议不写 api 字段；llm-pi-ai 路由改写协议才写', () => {
    const { service, settings } = makeService({ settings: DEEPSEEK_SETTINGS });
    service.save({ providerId: 'deepseek-official', baseURL: 'https://api.deepseek.com' });
    expect(settings()).not.toContain('api:');

    // llm-pi-ai 通道允许在路由上改写协议（接自建兼容网关）
    service.save({ providerId: 'openai', baseURL: 'https://gateway.example.com/v1', protocol: 'openai-completions' });
    expect(settings()).toContain('api: openai-completions');
  });

  it('save：单协议适配器（llm-deepseek）拒绝被塞别的协议', () => {
    const { service, settings } = makeService({ settings: DEEPSEEK_SETTINGS });
    expect(() =>
      service.save({ providerId: 'deepseek-official', baseURL: 'https://api.deepseek.com', protocol: 'anthropic-messages' }),
    ).toThrow(/只支持/);
    // 拒绝时不得留下半截配置
    expect(settings()).not.toContain('api:');
  });

  it('save：未知协议 fail-closed（400）', () => {
    const { service } = makeService({ settings: DEEPSEEK_SETTINGS });
    expect(() => service.save({ providerId: 'deepseek-official', baseURL: 'https://api.deepseek.com', protocol: 'not-a-protocol' })).toThrow();
  });

  it('save：非法网址 fail-closed', () => {
    const { service } = makeService({ settings: DEEPSEEK_SETTINGS });
    expect(() => service.save({ providerId: 'deepseek-official', baseURL: 'ftp://nope' })).toThrow();
    expect(() => service.save({ providerId: 'deepseek-official', baseURL: 'https://x.com/?q=1' })).toThrow();
  });

  it('save：未登记提供方 fail-closed', () => {
    const { service } = makeService({ settings: DEEPSEEK_SETTINGS });
    expect(() => service.save({ providerId: 'not-registered', baseURL: 'https://x.com' })).toThrow();
  });

  it('test：未配凭据时如实报错，不发请求', async () => {
    const { service } = makeService({ settings: DEEPSEEK_SETTINGS });
    const result = await service.test('deepseek-official');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('还没有值');
  });

  it('test：使用被测提供方的模型和原生协议', async () => {
    const { service } = makeService({ credentials: 'DEEPSEEK_API_KEY=ds-secret\nANTHROPIC_API_KEY=anth-secret\n' });
    service.save({ providerId: 'deepseek-official', baseURL: 'https://api.deepseek.com', models: [{ id: 'deepseek-test', name: 'DS' }] });
    service.save({ providerId: 'anthropic', baseURL: 'https://api.anthropic.com', models: [{ id: 'claude-test', name: 'Claude' }] });
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    try {
      const result = await service.test('anthropic');
      expect(result).toMatchObject({ ok: true, model: 'claude-test' });
      expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.anthropic.com/v1/messages');
      expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-api-key': 'anth-secret' });
      expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).model).toBe('claude-test');
    } finally { fetcher.mockRestore(); }
  });
});
