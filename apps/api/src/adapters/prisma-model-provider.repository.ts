import { Inject, Injectable } from '@nestjs/common';
import {
  type ModelItem,
  type ModelProviderPublicRow,
  type ModelProviderRepositoryPort,
  type ModelProviderRow,
} from '../ports/model-provider.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { storageUnavailable } from '../common/http-error';

@Injectable()
export class PrismaModelProviderRepository implements ModelProviderRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const c = this.prisma.getClient();
    if (!c) throw storageUnavailable();
    return c;
  }

  async list(): Promise<ModelProviderPublicRow[]> {
    const rows = await this.db().modelProvider.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => {
      let models: ModelItem[] = [];
      try {
        models = JSON.parse(r.modelsJson || '[]');
      } catch {
        models = [];
      }
      return {
        id: r.id,
        name: r.name,
        category: r.category,
        enabled: r.enabled,
        baseUrl: r.baseUrl,
        apiFormat: r.apiFormat,
        last4: r.last4,
        models,
        updatedAt: r.updatedAt,
      };
    });
  }

  findById(id: string): Promise<ModelProviderRow | null> {
    return this.db().modelProvider.findUnique({ where: { id } });
  }

  save(row: Omit<ModelProviderRow, 'createdAt' | 'updatedAt'>): Promise<ModelProviderRow> {
    return this.db().modelProvider.upsert({
      where: { id: row.id },
      create: { ...row },
      update: {
        name: row.name,
        category: row.category,
        enabled: row.enabled,
        baseUrl: row.baseUrl,
        apiFormat: row.apiFormat,
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.authTag,
        last4: row.last4,
        modelsJson: row.modelsJson,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.db().modelProvider.delete({ where: { id } });
  }
}
