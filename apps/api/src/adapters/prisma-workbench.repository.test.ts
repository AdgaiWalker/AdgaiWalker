import { beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { CredentialCipher } from '../auth/credential-cipher';
import { PrismaModelProviderRepository } from './prisma-model-provider.repository';
import { PrismaAgentUnitRepository } from './prisma-agent-unit.repository';
import type { PrismaPort } from '../ports/prisma.port';

const TEST_MASTER_KEY = 'a'.repeat(64);

describe('Prisma ModelProvider & AgentUnit Repositories', () => {
  let prisma: PrismaClient;
  let prismaPort: PrismaPort;
  let modelRepo: PrismaModelProviderRepository;
  let agentRepo: PrismaAgentUnitRepository;

  beforeAll(async () => {
    process.env.WALKER_CREDENTIAL_MASTER_KEY = TEST_MASTER_KEY;
    prisma = new PrismaClient();
    await prisma.$connect();
    prismaPort = {
      getClient: () => prisma,
      isWritable: () => true,
      ping: async () => true,
    };
    modelRepo = new PrismaModelProviderRepository(prismaPort);
    agentRepo = new PrismaAgentUnitRepository(prismaPort);
  });

  it('ModelProvider: 支持 AES-256 加密落库、解密还原与查询脱敏', async () => {
    const cipher = CredentialCipher.fromEnv()!;
    expect(cipher).toBeDefined();

    const plainKey = 'sk-deepseek-live-secret-key-12345';
    const encrypted = cipher.encrypt(plainKey);

    const saved = await modelRepo.save({
      id: 'test-deepseek',
      name: 'DeepSeek 官方',
      category: 'official',
      enabled: true,
      baseUrl: 'https://api.deepseek.com/v1',
      apiFormat: 'openai-compatible',
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      last4: plainKey.slice(-4),
      modelsJson: JSON.stringify([
        { id: 'deepseek-chat', tags: ['通用', '128K'] },
        { id: 'deepseek-reasoner', tags: ['思考', 'R1'] },
      ]),
    });

    expect(saved.id).toBe('test-deepseek');
    expect(saved.last4).toBe('2345');

    // 1. 测试列表查询（脱敏，解析 models 数组）
    const list = await modelRepo.list();
    const foundPublic = list.find((p) => p.id === 'test-deepseek');
    expect(foundPublic).toBeDefined();
    expect(foundPublic?.last4).toBe('2345');
    expect(foundPublic?.models.length).toBe(2);
    expect(foundPublic?.models[0].id).toBe('deepseek-chat');

    // 2. 测试根据 ID 获取（完整密文并能解密还原明文）
    const foundFull = await modelRepo.findById('test-deepseek');
    expect(foundFull).toBeDefined();
    expect(foundFull?.ciphertext).not.toBe(plainKey);
    const decrypted = cipher.decrypt({
      ciphertext: foundFull!.ciphertext,
      iv: foundFull!.iv,
      authTag: foundFull!.authTag,
    });
    expect(decrypted).toBe(plainKey);

    // 3. 删除测试
    await modelRepo.remove('test-deepseek');
    const afterDelete = await modelRepo.findById('test-deepseek');
    expect(afterDelete).toBeNull();
  });

  it('AgentUnit: 支持保存、查询（内置小影排前）与删除', async () => {
    // 保存小影（系统角色）
    await agentRepo.save({
      id: 'xiaoying',
      name: '小影',
      icon: 'bot',
      isSystem: true,
      providerId: null,
      modelId: 'deepseek-chat',
      prompt: '你是 Walker 个人站的站内助手小影...',
    });

    // 保存自定义角色
    await agentRepo.save({
      id: 'custom-writer',
      name: '文章工匠',
      icon: 'pen-tool',
      isSystem: false,
      providerId: null,
      modelId: 'deepseek-reasoner',
      prompt: '你专注于博客文章的润色与重构...',
    });

    const list = await agentRepo.list();
    expect(list.length).toBeGreaterThanOrEqual(2);
    // isSystem 优先排在前面
    expect(list[0].id).toBe('xiaoying');
    expect(list[0].isSystem).toBe(true);

    const custom = await agentRepo.findById('custom-writer');
    expect(custom).toBeDefined();
    expect(custom?.name).toBe('文章工匠');

    await agentRepo.remove('custom-writer');
    const afterDelete = await agentRepo.findById('custom-writer');
    expect(afterDelete).toBeNull();
  });
});
