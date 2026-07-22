import { describe, expect, it } from 'vitest';
import type { AppConfigPort } from '../config/config.port';
import type { PrismaPort } from '../ports/prisma.port';
import { HealthService } from './health.service';

function stubPrisma(pingOk: boolean): PrismaPort {
  return {
    getClient: () => null,
    isWritable: () => pingOk,
    ping: async () => pingOk,
  };
}

function stubConfig(partial: Partial<AppConfigPort> = {}): AppConfigPort {
  return {
    getDatabaseUrl: () => undefined,
    isAiEnabled: () => false,
    getPort: () => 8788,
    getNodeEnv: () => 'test',
    ...partial,
  };
}

/** 驱动真实 HealthService：端口用测试替身注入，不 mock 掉用例本身 */
describe('HealthService', () => {
  it('无库时 ok=true 且 db=false，aiEnabled 来自配置端口', async () => {
    const config = stubConfig({ isAiEnabled: () => false });
    const service = new HealthService(config, stubPrisma(false));
    const result = await service.getHealth();
    expect(result).toEqual({ ok: true, db: false, aiEnabled: false });
  });

  it('库 ping 成功时 db=true；AI 开关透传', async () => {
    const config = stubConfig({
      getDatabaseUrl: () => 'postgresql://example',
      isAiEnabled: () => true,
    });
    const service = new HealthService(config, stubPrisma(true));
    await expect(service.getHealth()).resolves.toEqual({
      ok: true,
      db: true,
      aiEnabled: true,
    });
  });
});
