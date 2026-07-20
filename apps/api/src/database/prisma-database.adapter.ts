import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { APP_CONFIG, type AppConfigPort } from '../config/config.port';
import type { DatabasePort } from './database.port';

/**
 * Prisma 适配器：实现 DatabasePort。
 * 无 DATABASE_URL 时不创建客户端，ping → false（禁止假持久）。
 */
@Injectable()
export class PrismaDatabaseAdapter implements DatabasePort, OnModuleDestroy {
  private client: PrismaClient | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfigPort) {
    const url = this.config.getDatabaseUrl();
    if (url) {
      this.client = new PrismaClient({
        datasources: { db: { url } },
      });
    }
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.$disconnect();
    }
  }
}
