import { Inject, Injectable } from '@nestjs/common';
import {
  type AgentUnitRepositoryPort,
  type AgentUnitRow,
} from '../ports/agent-unit.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { storageUnavailable } from '../common/http-error';

@Injectable()
export class PrismaAgentUnitRepository implements AgentUnitRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const c = this.prisma.getClient();
    if (!c) throw storageUnavailable();
    return c;
  }

  list(): Promise<AgentUnitRow[]> {
    return this.db().agentUnit.findMany({
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });
  }

  findById(id: string): Promise<AgentUnitRow | null> {
    return this.db().agentUnit.findUnique({ where: { id } });
  }

  save(row: Omit<AgentUnitRow, 'createdAt' | 'updatedAt'>): Promise<AgentUnitRow> {
    return this.db().agentUnit.upsert({
      where: { id: row.id },
      create: { ...row },
      update: {
        name: row.name,
        icon: row.icon,
        isSystem: row.isSystem,
        providerId: row.providerId,
        modelId: row.modelId,
        prompt: row.prompt,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.db().agentUnit.delete({ where: { id } });
  }
}
