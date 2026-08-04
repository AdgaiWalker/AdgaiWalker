import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_LIST_LIMIT } from '@walker/shared';
import { storageUnavailable } from '../common/http-error';
import { ACTION_REPOSITORY, type ActionRecord, type ActionRepositoryPort } from '../ports/action.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { SEED_REPOSITORY, type SeedRecord, type SeedRepositoryPort } from '../ports/seed.repository';
import { WORK_REPOSITORY, type WorkRecord, type WorkRepositoryPort } from '../ports/work.repository';

export interface WorkbenchSnapshot {
  topics: SeedRecord[];
  openActions: ActionRecord[];
  videoLog: ActionRecord[];
  activeWorks: WorkRecord[];
  generatedAt: string;
}

@Injectable()
export class WorkbenchService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(SEED_REPOSITORY) private readonly seeds: SeedRepositoryPort,
    @Inject(ACTION_REPOSITORY) private readonly actions: ActionRepositoryPort,
    @Inject(WORK_REPOSITORY) private readonly works: WorkRepositoryPort,
  ) {}

  async get(): Promise<WorkbenchSnapshot> {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const [topics, openActions, videoLog, activeWorks] = await Promise.all([
      this.seeds.list(DEFAULT_LIST_LIMIT),
      this.actions.list({ status: 'OPEN', limit: DEFAULT_LIST_LIMIT }),
      this.actions.list({ kind: 'VIDEO', limit: DEFAULT_LIST_LIMIT }),
      this.works.list(DEFAULT_LIST_LIMIT),
    ]);
    return { topics, openActions, videoLog, activeWorks, generatedAt: new Date().toISOString() };
  }
}
