import { Inject, Injectable } from '@nestjs/common';
import {
  assertClueBody,
  FEATURE_FAIL_CODES,
  isClueSource,
  RATE_LIMITS,
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
        failCode: FEATURE_FAIL_CODES.storageUnavailable,
      });
      throw storageUnavailable();
    }

    const limit = input.isAuthenticated
      ? RATE_LIMITS.userPerWindow
      : RATE_LIMITS.guestPerWindow;
    if (
      !this.rateLimit.consume(
        `intake:${input.ipKey}`,
        limit,
        RATE_LIMITS.windowSeconds,
      )
    ) {
      await this.events.record({
        id: newId(),
        featureKey: 'match.intake',
        event: 'fail',
        actorType,
        failCode: FEATURE_FAIL_CODES.rateLimited,
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
          failCode: FEATURE_FAIL_CODES.guestQuotaExceeded,
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
        failCode: FEATURE_FAIL_CODES.validationError,
      });
      throw validationError('clue-body-too-short');
    }

    const sourceRaw = input.source ?? 'tools-visitor';
    if (!isClueSource(sourceRaw)) {
      throw validationError('invalid-source');
    }
    const source = sourceRaw as ClueSource;

    // 预留/释放语义：先原子扣配额，配额拒绝时不产生任何线索；
    // AI 调用留在预留之后、建线索之前（不进事务）；建线索失败补偿释放，
    // 不留「扣了次数没线索」的反向孤儿。模型消耗无法回滚，属已知边界。
    if (!input.isAuthenticated) {
      const reserved = await this.guestQuota.consume(input.anonId);
      if (!reserved) {
        await this.events.record({
          id: newId(),
          featureKey: 'match.intake',
          event: 'fail',
          actorType,
          failCode: FEATURE_FAIL_CODES.guestQuotaExceeded,
        });
        throw guestQuotaExceeded();
      }
    }

    const step = await this.nextStep.generate(input.body.trim());
    let clue;
    try {
      clue = await this.clues.create({
        id: newId(),
        body: input.body.trim(),
        source,
        poolStatus: 'candidate',
        anonId: input.isAuthenticated ? null : input.anonId,
      });
    } catch (error) {
      if (!input.isAuthenticated) {
        await this.guestQuota.release(input.anonId).catch(() => {});
      }
      throw error;
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
      suggestedSlug: step.suggestedSlug ?? null,
      suggestedTitle: step.suggestedTitle ?? null,
      poolStatus: clue.poolStatus,
    };
  }
}
