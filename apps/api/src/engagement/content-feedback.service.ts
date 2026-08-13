import { Inject, Injectable } from '@nestjs/common';
import { newId } from '../common/ids';
import {
  storageUnavailable,
  validationError,
} from '../common/http-error';
import {
  FEATURE_EVENT,
  type FeatureEventPort,
} from '../ports/feature-event.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { SEED_REPOSITORY, type SeedRepositoryPort } from '../ports/seed.repository';
import { ACTION_REPOSITORY, type ActionRepositoryPort } from '../ports/action.repository';

const SIGNALS = new Set(['useful', 'needs-more', 'outdated']);

@Injectable()
export class ContentFeedbackService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(FEATURE_EVENT) private readonly events: FeatureEventPort,
    @Inject(SEED_REPOSITORY) private readonly seeds?: SeedRepositoryPort,
    @Inject(ACTION_REPOSITORY) private readonly actions?: ActionRepositoryPort,
  ) {}

  async submit(input: { contentId: string; signal: string; note?: string; source?: string }) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const contentId = input.contentId?.trim();
    if (!contentId || contentId.length > 200) {
      throw validationError('invalid-content-id');
    }
    if (!SIGNALS.has(input.signal)) {
      throw validationError('invalid-signal');
    }
    const note = (input.note ?? '').trim().slice(0, 500) || null;
    const client = this.prisma.getClient()!;
    const row = await client.contentFeedback.create({
      data: {
        id: newId(),
        contentId,
        signal: input.signal,
        note,
        source: input.source?.trim().slice(0, 100) || 'unknown',
      },
    });
    await this.events.record({
      id: newId(),
      featureKey: 'content.feedback',
      event: 'success',
      actorType: 'guest',
      props: { contentId, signal: input.signal },
    });
    return { id: row.id, contentId, signal: row.signal };
  }

  async convert(id: string, input: { target: 'SEED' | 'ACTION'; confirmed: boolean; title?: string; plannedDate?: string | null }) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    if (!input.confirmed) throw validationError('confirmation-required');
    if (input.target !== 'SEED' && input.target !== 'ACTION') throw validationError('invalid-conversion-target');
    const client = this.prisma.getClient()!;
    const feedback = await client.contentFeedback.findUnique({ where: { id } });
    if (!feedback) throw validationError('feedback-not-found');
    const title = input.title?.trim() || feedback.note?.trim() || `反馈：${feedback.contentId}`;
    if (input.target === 'SEED') {
      if (!this.seeds) throw storageUnavailable();
      if (feedback.convertedSeedId) return { target: 'SEED', id, seedId: feedback.convertedSeedId };
      const seed = await this.seeds.create({ id: newId(), title });
      await client.contentFeedback.update({ where: { id }, data: { convertedSeedId: seed.id } });
      return { target: 'SEED', id, seedId: seed.id };
    }
    if (!this.actions) throw storageUnavailable();
    if (feedback.convertedActionId) return { target: 'ACTION', id, actionId: feedback.convertedActionId };
    const action = await this.actions.create({
      id: newId(), title, note: feedback.note ?? null, kind: 'TASK', entityType: 'FEEDBACK', entityId: id,
      plannedDate: input.plannedDate ?? null, source: 'SYSTEM',
    });
    await client.contentFeedback.update({ where: { id }, data: { convertedActionId: action.id } });
    return { target: 'ACTION', id, actionId: action.id };
  }
}
