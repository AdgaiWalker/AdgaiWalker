import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { APP_CONFIG, type AppConfigPort } from '../config/config.port';
import type { PrismaPort } from '../ports/prisma.port';

@Injectable()
export class PrismaAdapter implements PrismaPort, OnModuleDestroy {
  private client: PrismaClient | null = null;

  constructor(@Inject(APP_CONFIG) config: AppConfigPort) {
    const url = config.getDatabaseUrl();
    if (url) {
      this.client = new PrismaClient({ datasources: { db: { url } } });
    }
  }

  getClient(): PrismaClient | null {
    return this.client;
  }

  isWritable(): boolean {
    return this.client !== null;
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
    if (this.client) await this.client.$disconnect();
  }
}
