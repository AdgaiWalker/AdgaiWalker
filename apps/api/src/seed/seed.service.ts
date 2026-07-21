import { Inject, Injectable } from '@nestjs/common';
import {
  assertPrimaryHasClue,
  FEATURE_FAIL_CODES,
  isInterestLevel,
  isValidTwoQuestions,
  type InterestLevel,
} from '@walker/shared';
import { newId } from '../common/ids';
import {
  missingClue,
  storageUnavailable,
  validationError,
} from '../common/http-error';
import {
  CLUE_REPOSITORY,
  type ClueRepositoryPort,
} from '../ports/clue.repository';
import {
  EXECUTION_REPOSITORY,
  type ExecutionRepositoryPort,
} from '../ports/execution.repository';
import {
  FEATURE_EVENT,
  type FeatureEventPort,
} from '../ports/feature-event.port';
import {
  SEED_REPOSITORY,
  type SeedRepositoryPort,
} from '../ports/seed.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

@Injectable()
export class SeedService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(SEED_REPOSITORY) private readonly seeds: SeedRepositoryPort,
    @Inject(CLUE_REPOSITORY) private readonly clues: ClueRepositoryPort,
    @Inject(EXECUTION_REPOSITORY)
    private readonly executions: ExecutionRepositoryPort,
    @Inject(FEATURE_EVENT) private readonly events: FeatureEventPort,
  ) {}

  async list(limit = 50) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    return this.seeds.list(limit);
  }

  async create(title: string) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    if (!title.trim()) throw validationError('title-required');
    return this.seeds.create({ id: newId(), title: title.trim() });
  }

  async linkClue(seedId: string, clueId: string, asPrimary = false) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const clue = await this.clues.findById(clueId);
    if (!clue) throw validationError('clue-not-found');
    await this.seeds.linkClue({
      id: newId(),
      seedId,
      clueId,
      role: asPrimary ? 'primary' : 'backup',
    });
    if (asPrimary) {
      return this.promote(seedId, clueId);
    }
    return this.seeds.findById(seedId);
  }

  /** 主选：必须 in-pool 线索，否则 missing-clue */
  async promote(seedId: string, clueId: string) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const seed = await this.seeds.findById(seedId);
    if (!seed) throw validationError('seed-not-found');
    const clue = await this.clues.findById(clueId);
    if (!clue) throw validationError('clue-not-found');

    // 确保 link 存在
    if (!seed.links.some((l) => l.clueId === clueId)) {
      await this.seeds.linkClue({
        id: newId(),
        seedId,
        clueId,
        role: 'backup',
      });
    }

    const refreshed = await this.seeds.findById(seedId);
    if (!refreshed) throw validationError('seed-not-found');

    // 构造用于断言的 links：目标 clue 视为 primary 候选
    const trialLinks = refreshed.links.map((l) =>
      l.clueId === clueId
        ? { ...l, role: 'primary' as const, poolStatus: clue.poolStatus }
        : { ...l, role: 'backup' as const },
    );
    // 若 link 里还没有，补上
    if (!trialLinks.some((l) => l.clueId === clueId)) {
      trialLinks.push({
        clueId,
        role: 'primary',
        poolStatus: clue.poolStatus,
      });
    }

    try {
      assertPrimaryHasClue(trialLinks);
    } catch {
      await this.events.record({
        id: newId(),
        featureKey: 'seed.promote',
        event: 'fail',
        actorType: 'owner',
        failCode: FEATURE_FAIL_CODES.validationError,
        props: { code: 'missing-clue' },
      });
      throw missingClue();
    }

    const result = await this.seeds.setPrimary(seedId, clueId);
    await this.executions.create({ id: newId(), seedId });
    await this.events.record({
      id: newId(),
      featureKey: 'seed.promote',
      event: 'success',
      actorType: 'owner',
      props: { seedId, clueId },
    });
    return result;
  }

  async setTwoQuestions(
    seedId: string,
    severity: string,
    selfInterest: string,
  ) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    if (!isInterestLevel(severity) || !isInterestLevel(selfInterest)) {
      throw validationError('invalid-two-questions');
    }
    const q = {
      severity: severity as InterestLevel,
      selfInterest: selfInterest as InterestLevel,
    };
    if (!isValidTwoQuestions(q)) throw validationError('invalid-two-questions');
    return this.seeds.updateTwoQuestions(seedId, q);
  }
}
