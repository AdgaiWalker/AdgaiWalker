import { describe, expect, it } from 'vitest';
import type { CluePoolStatus, ContentBrief, TopicStatus } from '@walker/shared';
import { SeedService } from './seed.service';
import type { ClueRepositoryPort } from '../ports/clue.repository';
import type { ExecutionRepositoryPort, ExecutionRecord } from '../ports/execution.repository';
import type { FeatureEventPort } from '../ports/feature-event.port';
import type { PrismaPort } from '../ports/prisma.port';
import type { SeedRecord, SeedRepositoryPort } from '../ports/seed.repository';
import type { ActionRecord, ActionRepositoryPort, NewActionRecord } from '../ports/action.repository';

const brief: ContentBrief = {
  audience: 'AI beginners',
  scenario: 'a first tutorial draft exists',
  problem: 'the work is hard to finish',
  keyQuestion: 'how to reduce repeated work after drafting',
  intendedAction: 'upload the draft',
};

function createSeedHarness(options: { inPoolClue?: boolean } = {}) {
  const now = new Date('2026-08-04T00:00:00.000Z');
  const clueId = 'clue-1';
  const executions: ExecutionRecord[] = [];
  const actions: ActionRecord[] = [];
  const seeds: SeedRecord[] = [];
  const clues = [
    {
      id: clueId,
      body: 'real user problem',
      source: 'manual-self' as const,
      poolStatus: (options.inPoolClue ? 'in-pool' : 'candidate') as CluePoolStatus,
      anonId: null,
      createdAt: now,
    },
  ];
  const seedRepo: SeedRepositoryPort = {
    async create(input) {
      const seed: SeedRecord = {
        id: input.id,
        title: input.title,
        severity: null,
        selfInterest: null,
        primaryClueId: null,
        workflowStatus: 'INBOX',
        whyNow: null,
        links: [],
        createdAt: now,
      };
      seeds.push(seed);
      return seed;
    },
    async findById(id) {
      return seeds.find((seed) => seed.id === id) ?? null;
    },
    async list() { return seeds; },
    async linkClue(input) {
      const seed = seeds.find((item) => item.id === input.seedId)!;
      seed.links.push({ clueId: input.clueId, role: input.role, poolStatus: clues[0].poolStatus });
    },
    async setPrimary(seedId, primaryClueId) {
      const seed = seeds.find((item) => item.id === seedId)!;
      seed.primaryClueId = primaryClueId;
      seed.links = seed.links.map((link) => ({ ...link, role: link.clueId === primaryClueId ? 'primary' : 'backup' }));
      return seed;
    },
    async updateTwoQuestions(seedId, q) {
      const seed = seeds.find((item) => item.id === seedId)!;
      seed.severity = q.severity;
      seed.selfInterest = q.selfInterest;
      return seed;
    },
    async updateTopic(id, input) {
      const seed = seeds.find((item) => item.id === id)!;
      if (input.title !== undefined) seed.title = input.title;
      if (input.workflowStatus !== undefined) seed.workflowStatus = input.workflowStatus;
      if (input.whyNow !== undefined) seed.whyNow = input.whyNow;
      return seed;
    },
  };
  const clueRepo: ClueRepositoryPort = {
    async create(input) { return { ...input, createdAt: now }; },
    async list() { return clues; },
    async findById(id) { return clues.find((clue) => clue.id === id) ?? null; },
    async updatePoolStatus(id, poolStatus) { const clue = clues.find((item) => item.id === id)!; clue.poolStatus = poolStatus; return clue; },
  };
  const executionRepo: ExecutionRepositoryPort = {
    async create(input) {
      const execution: ExecutionRecord = {
        id: input.id, seedId: input.seedId, status: 'doing', deliveryUrl: null,
        deliveryForm: null, deliveryNote: null, outcome: null, evidence: null,
        contentBrief: input.contentBrief ?? null, createdAt: now, updatedAt: now,
      };
      executions.push(execution);
      return execution;
    },
    async findById(id) { return executions.find((item) => item.id === id) ?? null; },
    async findBySeedId(seedId) { return executions.find((item) => item.seedId === seedId) ?? null; },
    async list() { return executions; },
    async deliver() { throw new Error('unused'); },
    async review() { throw new Error('unused'); },
  };
  const actionRepo: ActionRepositoryPort = {
    async create(input: NewActionRecord) {
      const action: ActionRecord = { ...input, status: 'OPEN', completedAt: null, createdAt: now, updatedAt: now };
      actions.push(action);
      return action;
    },
    async ensureOpenForEntity(input) {
      const existing = actions.find((item) => item.entityType === input.entityType && item.entityId === input.entityId && item.status === 'OPEN');
      return existing ?? this.create(input);
    },
    async findById(id) { return actions.find((item) => item.id === id) ?? null; },
    async list() { return actions; },
    async update() { throw new Error('unused'); },
    async setCompletion() { throw new Error('unused'); },
  };
  const events: FeatureEventPort = {
    async record() {},
    async listRecent() { return []; },
    async aggregate() { return { byFeature: {}, failCodes: {} }; },
  };
  const prisma: PrismaPort = { getClient: () => null, isWritable: () => true, async ping() { return true; } };
  const service = new SeedService(prisma, seedRepo, clueRepo, executionRepo, events, actionRepo);
  return { service, clueId, executions, actions, seeds };
}

function hasApiMessage(message: string) {
  return (error: unknown) => {
    const response = (error as { getResponse?: () => { message?: string } }).getResponse?.();
    return response?.message === message;
  };
}

describe('SeedService workstation behavior', () => {
  it('moves INBOX to CANDIDATE but rejects SELECTED without promote', async () => {
    const harness = createSeedHarness();
    const seed = await harness.service.create('first draft');
    await expect(harness.service.updateTopic(seed.id, { workflowStatus: 'CANDIDATE' })).resolves.toMatchObject({ workflowStatus: 'CANDIDATE' });
    await expect(harness.service.updateTopic(seed.id, { workflowStatus: 'SELECTED' })).rejects.toSatisfy(hasApiMessage('selected-requires-human-promote'));
  });

  it('promote creates one execution and one draft action even when retried', async () => {
    const harness = createSeedHarness({ inPoolClue: true });
    const seed = await harness.service.create('first draft');
    await harness.service.updateTopic(seed.id, { workflowStatus: 'CANDIDATE' as TopicStatus });
    await harness.service.promote(seed.id, harness.clueId, { whyNow: 'this week', brief });
    await harness.service.promote(seed.id, harness.clueId, { whyNow: 'this week', brief });
    expect(harness.executions).toHaveLength(1);
    expect(harness.actions).toHaveLength(1);
    expect(harness.actions[0]).toMatchObject({ kind: 'TASK', plannedDate: null, status: 'OPEN' });
  });
});
