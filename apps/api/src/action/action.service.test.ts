import { describe, expect, it } from 'vitest';
import { ActionService } from './action.service';
import type { ActionRecord, ActionRepositoryPort, NewActionRecord } from '../ports/action.repository';
import type { PrismaPort } from '../ports/prisma.port';

function createActionHarness() {
  const now = new Date('2026-08-04T00:00:00.000Z');
  const records: ActionRecord[] = [];
  const repository: ActionRepositoryPort = {
    async create(input: NewActionRecord) {
      const record: ActionRecord = { ...input, status: 'OPEN', completedAt: null, createdAt: now, updatedAt: now };
      records.push(record);
      return record;
    },
    async ensureOpenForEntity(input) { return this.create(input); },
    async findById(id) { return records.find((record) => record.id === id) ?? null; },
    async list(input) { return records.filter((record) => (!input.status || record.status === input.status) && (!input.kind || record.kind === input.kind)).slice(0, input.limit); },
    async update(id, input) { const record = records.find((item) => item.id === id)!; Object.assign(record, input); return record; },
    async setCompletion(id, input) { const record = records.find((item) => item.id === id)!; Object.assign(record, input); return record; },
  };
  const prisma: PrismaPort = { getClient: () => null, isWritable: () => true, async ping() { return true; } };
  return { service: new ActionService(prisma, repository), records };
}

describe('ActionService workstation behavior', () => {
  it('creates an undated video action', async () => {
    const { service } = createActionHarness();
    await expect(service.create({ title: 'record first video', kind: 'VIDEO', plannedDate: null })).resolves.toMatchObject({ kind: 'VIDEO', status: 'OPEN', plannedDate: null, completedAt: null });
  });

  it('sets, clears, completes, and reopens an action', async () => {
    const { service } = createActionHarness();
    const action = await service.create({ title: 'record first video', kind: 'VIDEO' });
    await expect(service.update(action.id, { plannedDate: '2026-08-08' })).resolves.toMatchObject({ plannedDate: '2026-08-08' });
    await expect(service.update(action.id, { plannedDate: null })).resolves.toMatchObject({ plannedDate: null });
    await expect(service.complete(action.id)).resolves.toMatchObject({ status: 'DONE' });
    await expect(service.reopen(action.id)).resolves.toMatchObject({ status: 'OPEN', completedAt: null });
  });
});
