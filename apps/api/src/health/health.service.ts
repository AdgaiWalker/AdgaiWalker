import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfigPort } from '../config/config.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

export interface HealthResult {
  ok: true;
  db: boolean;
  aiEnabled: boolean;
  /** 可读构建标识：部署时在 .env 写 WALKER_BUILD_VERSION（如 git short SHA），未配置为 null */
  version: string | null;
}

/** 健康用例：只依赖配置端口 + Prisma 端口 */
@Injectable()
export class HealthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigPort,
    @Inject(PRISMA) private readonly db: PrismaPort,
  ) {}

  async getHealth(): Promise<HealthResult> {
    const db = await this.db.ping();
    return {
      ok: true,
      db,
      aiEnabled: this.config.isAiEnabled(),
      version: process.env.WALKER_BUILD_VERSION?.trim() || null,
    };
  }
}
