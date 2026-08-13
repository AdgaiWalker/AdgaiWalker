import { describe, expect, it } from 'vitest';
import { ContentFeedbackService } from './content-feedback.service';
import type { ActionRepositoryPort } from '../ports/action.repository';
import type { FeatureEventPort } from '../ports/feature-event.port';
import type { SeedRepositoryPort } from '../ports/seed.repository';
import type { PrismaPort } from '../ports/prisma.port';

describe('ContentFeedbackService conversion', () => {
  it('requires confirmation and converts feedback to a seed only once', async () => {
    const feedback = {
      id: 'fb-1', contentId: 'post-1', signal: 'needs-more', note: '想看完整教程',
      source: 'comment', convertedSeedId: null, convertedActionId: null,
    };
    let createCount = 0;
    const client = {
      contentFeedback: {
        findUnique: async () => feedback,
        update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(feedback, data),
        create: async () => feedback,
      },
    };
    const prisma: PrismaPort = { getClient: () => client as never, isWritable: () => true, ping: async () => true };
    const seeds: SeedRepositoryPort = {
      create: async (input) => { createCount += 1; return { id: input.id, title: input.title, severity: null, selfInterest: null, primaryClueId: null, workflowStatus: 'INBOX', whyNow: null, links: [], createdAt: new Date() }; },
      findById: async () => null, list: async () => [], linkClue: async () => {}, setPrimary: async () => { throw new Error('unused'); }, updateTwoQuestions: async () => { throw new Error('unused'); }, updateTopic: async () => { throw new Error('unused'); },
    };
    const actions = {} as ActionRepositoryPort;
    const events: FeatureEventPort = { record: async () => {}, listRecent: async () => [], aggregate: async () => ({ byFeature: {}, failCodes: {} }) };
    const svc = new ContentFeedbackService(prisma, events, seeds, actions);

    await expect(svc.convert('fb-1', { target: 'SEED', confirmed: false })).rejects.toSatisfy((e: { getResponse?: () => { message?: string } }) => e.getResponse?.()?.message === 'confirmation-required');
    await expect(svc.convert('fb-1', { target: 'SEED', confirmed: true })).resolves.toMatchObject({ target: 'SEED', id: 'fb-1' });
    await expect(svc.convert('fb-1', { target: 'SEED', confirmed: true })).resolves.toMatchObject({ target: 'SEED', id: 'fb-1' });
    expect(createCount).toBe(1);
    expect(feedback.convertedSeedId).toBeTruthy();
  });
});
