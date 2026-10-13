import { beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaAgentUnitRepository } from './prisma-agent-unit.repository';
import type { PrismaPort } from '../ports/prisma.port';

describe('Prisma AgentUnit Repository', () => {
  let prisma: PrismaClient;
  let prismaPort: PrismaPort;
  let agentRepo: PrismaAgentUnitRepository;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    prismaPort = {
      getClient: () => prisma,
      isWritable: () => true,
      ping: async () => true,
    };
    agentRepo = new PrismaAgentUnitRepository(prismaPort);
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
