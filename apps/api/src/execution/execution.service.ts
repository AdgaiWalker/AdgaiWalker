import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_LIST_LIMIT,
  isCountableLoop,
  isValidDelivery,
  isValidReview,
  type DeliveryForm,
  type ReviewOutcome,
} from '@walker/shared';
import { newId } from '../common/ids';
import {
  storageUnavailable,
  validationError,
} from '../common/http-error';
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
export class ExecutionService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(EXECUTION_REPOSITORY)
    private readonly executions: ExecutionRepositoryPort,
    @Inject(SEED_REPOSITORY) private readonly seeds: SeedRepositoryPort,
    @Inject(FEATURE_EVENT) private readonly events: FeatureEventPort,
  ) {}

  async list(limit = DEFAULT_LIST_LIMIT) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    return this.executions.list(limit);
  }

  async deliver(
    id: string,
    input: { url?: string; form?: string; note?: string },
  ) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const delivery = {
      url: input.url,
      form: input.form as DeliveryForm | undefined,
      note: input.note,
    };
    if (!isValidDelivery(delivery)) {
      throw validationError('invalid-delivery');
    }
    return this.executions.deliver(id, {
      url: input.url ?? null,
      form: (input.form as DeliveryForm) ?? null,
      note: input.note ?? null,
    });
  }

  async review(
    id: string,
    input: { outcome: string; evidence?: string },
  ) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const review = {
      outcome: input.outcome as ReviewOutcome,
      evidence: input.evidence,
    };
    if (!isValidReview(review)) {
      throw validationError('invalid-review');
    }
    const ex = await this.executions.findById(id);
    if (!ex) throw validationError('execution-not-found');
    const seed = await this.seeds.findById(ex.seedId);
    if (!seed) throw validationError('seed-not-found');

    const updated = await this.executions.review(id, {
      outcome: review.outcome,
      evidence: input.evidence ?? null,
    });

    const countable = isCountableLoop({
      links: seed.links,
      delivery: {
        url: updated.deliveryUrl,
        form: updated.deliveryForm as DeliveryForm | null,
        note: updated.deliveryNote,
      },
      review: {
        outcome: review.outcome,
        evidence: input.evidence,
      },
    });

    await this.events.record({
      id: newId(),
      featureKey: 'execution.review',
      event: 'success',
      actorType: 'owner',
      props: { executionId: id, outcome: review.outcome, countable },
    });

    return { ...updated, countable };
  }
}
