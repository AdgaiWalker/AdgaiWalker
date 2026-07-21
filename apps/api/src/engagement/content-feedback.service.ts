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

const SIGNALS = new Set(['useful', 'needs-more', 'outdated']);

@Injectable()
export class ContentFeedbackService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(FEATURE_EVENT) private readonly events: FeatureEventPort,
  ) {}

  async submit(input: { contentId: string; signal: string; note?: string }) {
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
}
