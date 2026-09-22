import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { OPERATIONS_JOURNAL, OUTBOX_HANDLERS, type OperationsJournalPort, type OutboxHandlers } from '../ports/operations-journal.port';
import { OutboxDispatcher } from './outbox-dispatcher';

const prefix = `journal-${randomUUID()}`;
let module: TestingModule;
let journal: OperationsJournalPort;
let dispatcher: OutboxDispatcher;
let db: NonNullable<ReturnType<PrismaPort['getClient']>>;
let failConsumer = true;
beforeAll(async () => {
  vi.stubEnv('AI_ENABLED', 'false');
  const handlers: OutboxHandlers = {
    async 'test.effect'(event, tx) {
      await tx.appendAudit({
        id: `${event.id}-effect`, actor: 'test', action: 'effect', targetType: 'test', targetId: prefix, outcome: 'ok',
      });
      if (failConsumer) throw new Error('测试秘密不能落库');
    },
  };
  module = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
    .overrideProvider(OUTBOX_HANDLERS).useValue(handlers).compile();
  journal = module.get(OPERATIONS_JOURNAL);
  dispatcher = module.get(OutboxDispatcher);
  db = module.get<PrismaPort>(PRISMA).getClient()!;
});
afterAll(async () => {
  await db?.outbox.deleteMany({ where: { aggregateId: prefix } });
  await db?.auditRecord.deleteMany({ where: { targetId: prefix } });
  await db?.executionRun.deleteMany({ where: { actorScope: prefix } });
  await module?.close();
  vi.unstubAllEnvs();
});

it('审计写入失败会回滚执行与 Outbox，不能留下半条事实', async () => {
  const audit = { id: `${prefix}-audit`, actor: 'owner', action: 'submit', targetType: 'test', targetId: prefix, outcome: 'ok' };
  await expect(journal.transaction(async (tx) => {
    await tx.runs.submitIfAbsent({
      id: prefix, actor: 'owner', actorScope: prefix, origin: 'admin', kind: 'chat',
      agentRevisionId: null, requestKey: prefix, inputHash: 'a'.repeat(64), deadline: null,
    });
    await tx.appendAudit(audit);
    await tx.enqueue({ id: `${prefix}-rollback`, eventKey: `${prefix}-rollback`, topic: 'test.effect', aggregateId: prefix, payloadRef: null });
    await tx.appendAudit(audit);
  })).rejects.toThrow();
  expect(await db.executionRun.count({ where: { actorScope: prefix } })).toBe(0);
  expect(await db.outbox.count({ where: { aggregateId: prefix } })).toBe(0);
  expect(await db.auditRecord.count({ where: { targetId: prefix } })).toBe(0);
});

it('消费者失败无部分效果，重试只产生一次效果；五次失败进入可查死信', async () => {
  const id = `${prefix}-event`;
  await journal.transaction((tx) => tx.enqueue({ id, eventKey: id, topic: 'test.effect', aggregateId: prefix, payloadRef: null }));
  let now = new Date(Date.now() + 1_000);
  expect(await dispatcher.dispatch(now)).toEqual({ delivered: 0, failed: 1 });
  expect(await db.auditRecord.count({ where: { targetId: prefix } })).toBe(0);
  expect((await db.outbox.findUniqueOrThrow({ where: { id } })).lastError).toBe('outbox-delivery-failed');
  failConsumer = false;
  now = new Date(now.getTime() + 2_000);
  expect(await dispatcher.dispatch(now)).toEqual({ delivered: 1, failed: 0 });
  expect(await dispatcher.dispatch(now)).toEqual({ delivered: 0, failed: 0 });
  expect(await db.auditRecord.count({ where: { id: `${id}-effect` } })).toBe(1);

  const deadId = `${prefix}-dead`;
  await journal.transaction((tx) => tx.enqueue({ id: deadId, eventKey: deadId, topic: 'missing-handler', aggregateId: prefix, payloadRef: null }));
  for (let attempt = 0; attempt < 5; attempt++) {
    now = new Date(now.getTime() + 60_000);
    await dispatcher.dispatch(now);
  }
  expect((await journal.deadLetters(100)).find((event) => event.id === deadId)).toMatchObject({ attempt: 5, lastError: 'outbox-delivery-failed' });
});
