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
    getHost: () => '127.0.0.1',
    getPort: () => 8788,
    getNodeEnv: () => 'test',
    getWorkRootDir: () => 'var/works',
    getWorkMaxUploadBytes: () => 100 * 1024 * 1024,
    ...partial,
  };
}

/** 驱动真实 HealthService：端口用测试替身注入，不 mock 掉用例本身 */
describe('HealthService', () => {
  it('无库时 ok=true 且 db=false，aiEnabled 来自配置端口', async () => {
    const config = stubConfig({ isAiEnabled: () => false });
    const service = new HealthService(config, stubPrisma(false));
    const result = await service.getHealth();
    expect(result).toEqual({ ok: true, db: false, aiEnabled: false, version: null });
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
      version: null,
    });
  });

  it('WALKER_BUILD_VERSION 配置时透出可读构建标识', async () => {
    process.env.WALKER_BUILD_VERSION = ' 12b4f0d ';
    try {
      const service = new HealthService(stubConfig(), stubPrisma(true));
      await expect(service.getHealth()).resolves.toMatchObject({ version: '12b4f0d' });
    } finally {
      delete process.env.WALKER_BUILD_VERSION;
    }
  });
});
