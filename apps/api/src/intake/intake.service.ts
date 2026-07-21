import { Inject, Injectable } from '@nestjs/common';
import {
  assertClueBody,
  isClueSource,
  type ClueSource,
} from '@walker/shared';
import { newId } from '../common/ids';
import {
  guestQuotaExceeded,
  rateLimited,
  storageUnavailable,
  validationError,
} from '../common/http-error';
import {
  CLUE_REPOSITORY,
  type ClueRepositoryPort,
} from '../ports/clue.repository';
import {
  FEATURE_EVENT,
  type FeatureEventPort,
} from '../ports/feature-event.port';
import { GUEST_QUOTA, type GuestQuotaPort } from '../ports/guest-quota.port';
import {
  NEXT_STEP_STRATEGY,
  type NextStepStrategyPort,
} from '../ports/nextstep.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { RATE_LIMIT, type RateLimitPort } from '../ports/rate-limit.port';

export interface IntakeInput {
  body: string;
  source?: string;
  anonId: string;
  ipKey: string;
  isAuthenticated?: boolean;
}

@Injectable()
export class IntakeService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(CLUE_REPOSITORY) private readonly clues: ClueRepositoryPort,
    @Inject(NEXT_STEP_STRATEGY) private readonly nextStep: NextStepStrategyPort,
    @Inject(RATE_LIMIT) private readonly rateLimit: RateLimitPort,
    @Inject(GUEST_QUOTA) private readonly guestQuota: GuestQuotaPort,
    @Inject(FEATURE_EVENT) private readonly events: FeatureEventPort,
  ) {}

  async intake(input: IntakeInput) {
    const actorType = input.isAuthenticated ? 'user' : 'guest';
    await this.events.record({
      id: newId(),
      featureKey: 'match.intake',
      event: 'attempt',
      actorType,
    });

    if (!this.prisma.isWritable()) {
      await this.events.record({
        id: newId(),
        featureKey: 'match.intake',
        event: 'fail',
        actorType,
        failCode: 'server_error',
      });
      throw storageUnavailable();
    }

    const limit = input.isAuthenticated ? 30 : 10;
    if (!this.rateLimit.consume(`intake:${input.ipKey}`, limit, 600)) {
      await this.events.record({
        id: newId(),
        featureKey: 'match.intake',
        event: 'fail',
        actorType,
        failCode: 'rate_limited',
      });
      throw rateLimited();
    }

    if (!input.isAuthenticated) {
      const exhausted = await this.guestQuota.isExhausted(input.anonId);
      if (exhausted) {
        await this.events.record({
          id: newId(),
          featureKey: 'match.intake',
          event: 'fail',
          actorType,
          failCode: 'quota_exceeded',
        });
        throw guestQuotaExceeded();
      }
    }

    try {
      assertClueBody(input.body);
    } catch {
      await this.events.record({
        id: newId(),
        featureKey: 'match.intake',
        event: 'fail',
        actorType,
        failCode: 'validation_error',
      });
      throw validationError('clue-body-too-short');
    }

    const sourceRaw = input.source ?? 'tools-visitor';
    if (!isClueSource(sourceRaw)) {
      throw validationError('invalid-source');
    }
    const source = sourceRaw as ClueSource;

    const step = await this.nextStep.generate(input.body.trim());
    const clue = await this.clues.create({
      id: newId(),
      body: input.body.trim(),
      source,
      poolStatus: 'candidate',
      anonId: input.isAuthenticated ? null : input.anonId,
    });

    if (!input.isAuthenticated) {
      const ok = await this.guestQuota.consume(input.anonId);
      if (!ok) {
        // 竞态：刚耗尽
        throw guestQuotaExceeded();
      }
    }

    await this.events.record({
      id: newId(),
      featureKey: 'match.intake',
      event: 'success',
      actorType,
      props: { clueId: clue.id, bucketId: step.bucketId },
    });

    return {
      clueId: clue.id,
      nextStep: step.nextStep,
      bucketId: step.bucketId,
      aiUsedFlag: step.aiUsedFlag,
      poolStatus: clue.poolStatus,
    };
  }
}
