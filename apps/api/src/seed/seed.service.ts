import { Inject, Injectable } from '@nestjs/common';
import {
  assertPrimaryHasClue,
  DEFAULT_LIST_LIMIT,
  FEATURE_FAIL_CODES,
  isInterestLevel,
  isValidTwoQuestions,
  assertTopicTransition,
  normalizeContentBrief,
  type ContentBrief,
  type CluePoolStatus,
  type InterestLevel,
  type SeedClueLink,
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
import { ACTION_REPOSITORY, type ActionRepositoryPort } from '../ports/action.repository';

@Injectable()
export class SeedService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(SEED_REPOSITORY) private readonly seeds: SeedRepositoryPort,
    @Inject(CLUE_REPOSITORY) private readonly clues: ClueRepositoryPort,
    @Inject(EXECUTION_REPOSITORY)
    private readonly executions: ExecutionRepositoryPort,
    @Inject(FEATURE_EVENT) private readonly events: FeatureEventPort,
    @Inject(ACTION_REPOSITORY) private readonly actions?: ActionRepositoryPort,
  ) {}

  async list(limit = DEFAULT_LIST_LIMIT) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    return this.seeds.list(limit);
  }

  async create(title: string) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    if (!title.trim()) throw validationError('title-required');
    return this.seeds.create({ id: newId(), title: title.trim() });
  }

  async updateTopic(
    seedId: string,
    input: { title?: string; workflowStatus?: import('@walker/shared').TopicStatus; whyNow?: string | null },
  ) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const seed = await this.seeds.findById(seedId);
    if (!seed) throw validationError('seed-not-found');
    if (input.workflowStatus === 'SELECTED') {
      throw validationError('selected-requires-human-promote');
    }
    if (input.workflowStatus) {
      try {
        assertTopicTransition(seed.workflowStatus, input.workflowStatus);
      } catch (error) {
        throw validationError(error instanceof Error ? error.message : 'invalid-topic-transition');
      }
    }
    if (input.title !== undefined && !input.title.trim()) {
      throw validationError('title-required');
    }
    return this.seeds.updateTopic(seedId, {
      title: input.title?.trim(),
      workflowStatus: input.workflowStatus,
      whyNow: input.whyNow === undefined ? undefined : input.whyNow?.trim() || null,
    });
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
  async promote(
    seedId: string,
    clueId: string,
    input?: { whyNow?: string; brief?: ContentBrief },
  ) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const seed = await this.seeds.findById(seedId);
    if (!seed) throw validationError('seed-not-found');
    const clue = await this.clues.findById(clueId);
    if (!clue) throw validationError('clue-not-found');

    if (this.actions && !input?.brief) {
      throw validationError('content-brief-incomplete');
    }

    await this.ensureClueLinked(seedId, clueId, seed.links);

    const refreshed = await this.seeds.findById(seedId);
    if (!refreshed) throw validationError('seed-not-found');

    const trialLinks = this.buildPrimaryTrialLinks(
      refreshed.links,
      clueId,
      clue.poolStatus,
    );

    try {
      assertPrimaryHasClue(trialLinks);
    } catch {
      await this.events.record({
        id: newId(),
        featureKey: 'seed.promote',
        event: 'fail',
        actorType: 'owner',
        failCode: FEATURE_FAIL_CODES.missingClue,
        props: { code: 'missing-clue' },
      });
      throw missingClue();
    }

    const normalizedBrief = input?.brief
      ? (() => {
          try {
            return normalizeContentBrief(input.brief);
          } catch (error) {
            throw validationError(error instanceof Error ? error.message : 'content-brief-incomplete');
          }
        })()
      : null;
    const result = await this.seeds.setPrimary(seedId, clueId);
    const execution = await this.executions.findBySeedId(seedId);
    const ensuredExecution = execution ?? (await this.executions.create({
      id: newId(),
      seedId,
      contentBrief: normalizedBrief,
    }));
    if (this.seeds.updateTopic) {
      await this.seeds.updateTopic(seedId, {
        workflowStatus: 'SELECTED',
        whyNow: input?.whyNow?.trim() || null,
      });
    }
    if (this.actions && normalizedBrief) {
      await this.actions.ensureOpenForEntity({
        id: newId(),
        title: `Write first draft: ${refreshed.title}`,
        note: normalizedBrief.keyQuestion,
        kind: 'TASK',
        entityType: 'EXECUTION',
        entityId: ensuredExecution.id,
        plannedDate: null,
        source: 'SYSTEM',
      });
    }
    await this.events.record({
      id: newId(),
      featureKey: 'seed.promote',
      event: 'success',
      actorType: 'owner',
      props: { seedId, clueId },
    });
    return result;
  }

  private async ensureClueLinked(
    seedId: string,
    clueId: string,
    links: Array<{ clueId: string }>,
  ): Promise<void> {
    if (links.some((l) => l.clueId === clueId)) return;
    await this.seeds.linkClue({
      id: newId(),
      seedId,
      clueId,
      role: 'backup',
    });
  }

  /** 将目标 clue 视为 primary 候选，供 assertPrimaryHasClue 使用 */
  private buildPrimaryTrialLinks(
    links: SeedClueLink[],
    clueId: string,
    poolStatus: CluePoolStatus,
  ): SeedClueLink[] {
    const trial: SeedClueLink[] = links.map((l) =>
      l.clueId === clueId
        ? { ...l, role: 'primary' as const, poolStatus }
        : { ...l, role: 'backup' as const },
    );
    if (!trial.some((l) => l.clueId === clueId)) {
      trial.push({ clueId, role: 'primary', poolStatus });
    }
    return trial;
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
