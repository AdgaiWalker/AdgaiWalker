import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FsModelDirectory } from '../adapters/fs-model-directory';
import { AgentModelConfigService } from './agent-model-config.service';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const DEEPSEEK_SETTINGS = [
  'llm-deepseek:',
  '  apiKeyEnv: DEEPSEEK_API_KEY',
  '  baseURL: https://api.deepseek.com',
  'agent-default-model:',
  '  provider: deepseek-official',
  '  model: deepseek-flash',
  '',
].join('\n');

/** 建一个临时 home + 一个「已存在」的 Agent（用假的 revisions 端口满足存在性校验）。 */
function makeService(existing = ['xiaoying']) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-agent-cfg-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'settings.yaml'), DEEPSEEK_SETTINGS);
  fs.writeFileSync(path.join(root, 'credentials.env'), 'DEEPSEEK_API_KEY=shared-value\n');
  const revisions = {
    detail: async (id: string) => (existing.includes(id) ? { id, name: id, archivedAt: null, revisions: [] } : null),
  } as never;
  return {
    root,
    service: new AgentModelConfigService(new FsModelDirectory(root), revisions),
  };
}

describe('AgentModelConfigService（每个 Agent 独立配置）', () => {
  it('read：没配过时回落共享层，并如实标注来源', async () => {
    const { service } = makeService();
    const view = await service.read('xiaoying');
    expect(view.providerId).toBe('deepseek-official');
    expect(view.modelId).toBe('deepseek-flash');
    expect(view.providerFromAgent).toBe(false);
    expect(view.modelFromAgent).toBe(false);
    expect(view.credentialScope).toBe('shared');
    expect(view.hasOwnCredential).toBe(false);
    expect(JSON.stringify(view)).not.toContain('shared-value');
  });

  it('save：写自己的 Key 后来源变为 agent（独立配置生效）', async () => {
    const { service } = makeService();
    const view = await service.save('xiaoying', { apiKey: 'sk-mine' });
    expect(view.credentialScope).toBe('agent');
    expect(view.hasOwnCredential).toBe(true);
    expect(JSON.stringify(view)).not.toContain('sk-mine');
  });

  it('save：只写该 Agent 的目录，**绝不触碰共享层**', async () => {
    const { service, root } = makeService();
    await service.save('xiaoying', { modelId: 'deepseek-v4-pro', apiKey: 'sk-mine' });
    const sharedBefore = 'DEEPSEEK_API_KEY=shared-value\n';
    expect(fs.readFileSync(path.join(root, 'credentials.env'), 'utf8')).toBe(sharedBefore);
    expect(fs.readFileSync(path.join(root, 'settings.yaml'), 'utf8')).toBe(DEEPSEEK_SETTINGS);
    // 自己的那份确实写了
    expect(fs.readFileSync(path.join(root, 'agents', 'xiaoying', 'credentials.env'), 'utf8')).toContain('sk-mine');
  });

  it('save：换提供方时凭据引用名跟着换（否则会拿 A 的 Key 打 B）', async () => {
    const { service, root } = makeService();
    const view = await service.save('xiaoying', { providerId: 'anthropic', modelId: 'claude-sonnet-5' });
    expect(view.providerId).toBe('anthropic');
    expect(view.apiKeyRef).toBe('ANTHROPIC_API_KEY');
    const own = fs.readFileSync(path.join(root, 'agents', 'xiaoying', 'settings.yaml'), 'utf8');
    expect(own).toContain('providers:');
    expect(own).toContain('anthropic:');
    expect(own).toContain('apiKeyEnv: ANTHROPIC_API_KEY');
  });

  it('save：清除 Agent 专用提供方后恢复共享层默认', async () => {
    const { service } = makeService();
    await service.save('xiaoying', { providerId: 'anthropic', modelId: 'claude-sonnet-5' });
    const restored = await service.save('xiaoying', { providerId: null, modelId: 'deepseek-v4-flash' });
    expect(restored.providerId).toBe('deepseek-official');
    expect(restored.providerFromAgent).toBe(false);
  });

  it('清除独立模型后跟随系统默认的后续变化', async () => {
    const { service, root } = makeService();
    await service.save('xiaoying', { providerId: 'anthropic', modelId: 'claude-sonnet-5' });
    await service.save('xiaoying', { providerId: null });
    fs.writeFileSync(path.join(root, 'settings.yaml'), DEEPSEEK_SETTINGS.replace('deepseek-flash', 'deepseek-next'));
    const view = await service.read('xiaoying');
    expect(view.providerFromAgent).toBe(false);
    expect(view.modelFromAgent).toBe(false);
    expect(view.modelId).toBe('deepseek-next');
  });

  it('save：换提供方时清掉旧适配器段，不留残影', async () => {
    const { service, root } = makeService();
    await service.save('xiaoying', { providerId: 'anthropic', modelId: 'claude-sonnet-5' });
    const text = fs.readFileSync(path.join(root, 'agents', 'xiaoying', 'settings.yaml'), 'utf8');
    expect(text).toContain('llm-pi-ai');
    expect(text).not.toContain('llm-deepseek');
  });

  it('save：名称选填，留空回落模型 ID；显式清空也回落 ID', async () => {
    const { service } = makeService();
    const named = await service.save('xiaoying', { modelName: '我的名字' });
    expect(named.modelName).toBe('我的名字');
    const cleared = await service.save('xiaoying', { modelName: '' });
    // 清空后显示名回落模型 ID（不是留空、也不是旧名）
    expect(cleared.modelName).toBe(cleared.modelId);
  });

  it('save：模型 ID 必填（空串被拒）', async () => {
    const { service } = makeService();
    await expect(service.save('xiaoying', { modelId: '   ' })).rejects.toThrow();
  });

  it('save：apiKey=null 删除自己的 Key，回落共享层', async () => {
    const { service } = makeService();
    await service.save('xiaoying', { apiKey: 'sk-mine' });
    const back = await service.save('xiaoying', { apiKey: null });
    expect(back.hasOwnCredential).toBe(false);
    expect(back.credentialScope).toBe('shared');
  });

  it('save：未登记的提供方 fail-closed', async () => {
    const { service } = makeService();
    await expect(service.save('xiaoying', { providerId: 'not-registered' })).rejects.toThrow();
  });

  it('不存在的 Agent fail-closed（404）', async () => {
    const { service } = makeService();
    await expect(service.read('nope')).rejects.toThrow();
    await expect(service.save('nope', { modelId: 'x' })).rejects.toThrow();
  });
});
