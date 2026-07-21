import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfigPort } from '../config/config.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

export interface HealthResult {
  ok: true;
  db: boolean;
  aiEnabled: boolean;
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
    };
  }
}
