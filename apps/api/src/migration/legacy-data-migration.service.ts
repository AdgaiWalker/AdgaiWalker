import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { storageUnavailable } from '../common/http-error';
import { migrateLegacyData, type LegacyDataMigrationResult } from './legacy-data-migration.core';

/**
 * G01 旧数据导入（Nest 注入版）：逻辑全部委托给零装饰器的 core，
 * 本类只做 DI 装配，保证 CLI 与服务端走同一份迁移实现。
 */
@Injectable()
export class LegacyDataMigrationService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  async migrateAll(actor = 'migration-job'): Promise<LegacyDataMigrationResult> {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    return migrateLegacyData(db as never, {
      idFactory: () => randomUUID(),
      actor,
    });
  }
}
