import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  assertClueBody,
  consumesGuestQuota,
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
import { JevFastPathService, recordQuotaExempt } from '../assistant/jev-fast-path.service';

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
    @Optional() @Inject(JevFastPathService) private readonly jevFastPath?: JevFastPathService,
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

    // JEV Fast-Path 轻量意图前置分流与额度豁免 (Quota Exemption)
    // 礼貌问候、站点/站主/模型说明、提示词防御直接极速直出，不扣减 15 次额度，不污染线索池
    const fastPathService = this.jevFastPath ?? new JevFastPathService();
    if (fastPathService.isEnabled()) {
      const fastPath = await fastPathService.check(input.body);
      if (fastPath && fastPath.fastPathReason !== 'action_stuck') {
        recordQuotaExempt();
        await this.events.record({
          id: newId(),
          featureKey: 'match.intake',
          event: 'success',
          actorType,
          props: { fastPathReason: fastPath.fastPathReason, quotaExempt: true },
        });
        return {
          clueId: `exempt-${newId()}`,
          nextStep: fastPath.result.answer,
          bucketId: 'general_start',
          aiUsedFlag: fastPath.result.aiUsedFlag,
          suggestedSlug: fastPath.result.citations?.[0]?.slug ?? null,
          suggestedTitle: null,
          poolStatus: 'candidate',
        };
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

    // 少于 4 字视为轻量问候/试探，允许发送但不扣减访客 30 天完整体验配额
    const shouldConsumeQuota = !input.isAuthenticated && consumesGuestQuota(input.body);

    if (shouldConsumeQuota) {
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

    const sourceRaw = input.source ?? 'tools-visitor';
    if (!isClueSource(sourceRaw)) {
      throw validationError('invalid-source');
    }
    const source = sourceRaw as ClueSource;

    // 预留/释放语义：先原子扣配额，配额拒绝时不产生任何线索；
    // AI 调用留在预留之后、建线索之前（不进事务）；建线索失败补偿释放，
    // 不留「扣了次数没线索」的反向孤儿。模型消耗无法回滚，属已知边界。
    if (shouldConsumeQuota) {
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
      if (shouldConsumeQuota) {
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
