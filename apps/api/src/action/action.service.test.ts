import fs from 'node:fs';
import path from 'node:path';
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
    async delete(id) { const index = records.findIndex((item) => item.id === id); if (index >= 0) records.splice(index, 1); },
  };
  const prisma: PrismaPort = { getClient: () => null, isWritable: () => true, async ping() { return true; } };
  return { service: new ActionService(prisma, repository), records };
}

/** 校验类错误的仓库断言约定：读 ApiError 的响应体 message（见 seed.service.test.ts / kernel.integration.test.ts） */
async function expectValidationMessage(promise: Promise<unknown>, message: string) {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    const body = (error as { getResponse?: () => { message?: string } }).getResponse?.();
    return body?.message === message;
  });
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

  it('create 支持可选 entityType/entityId（CONTENT 排期落库后仍在）', async () => {
    const { service, records } = createActionHarness();
    const action = await service.create({
      title: '发布《DoraZoom 手记》',
      entityType: 'CONTENT',
      entityId: 'dorazoom',
      plannedDate: '2026-09-20',
    });
    expect(action).toMatchObject({ entityType: 'CONTENT', entityId: 'dorazoom', plannedDate: '2026-09-20' });
    // 刷新后仍在（读模型回放）
    const listed = await service.list({});
    expect(listed.find((item) => item.id === action.id)).toMatchObject({ entityType: 'CONTENT', entityId: 'dorazoom' });
    expect(records).toHaveLength(1);
  });

  it('不传 entity 参数时与现状一致（null），缺省参数零回归', async () => {
    const { service } = createActionHarness();
    const action = await service.create({ title: 'plain task', kind: 'TASK' });
    expect(action).toMatchObject({ entityType: null, entityId: null });
  });

  it('未知 entityType 直接拒绝（词表 fail-closed）', async () => {
    const { service } = createActionHarness();
    await expectValidationMessage(
      service.create({ title: 'x', entityType: 'WHATEVER', entityId: 'a' }),
      'invalid-action-entity-type',
    );
  });

  it('有 entityId 但缺/未知 entityType 拒绝；有 type 缺 id 拒绝', async () => {
    const { service } = createActionHarness();
    await expectValidationMessage(
      service.create({ title: 'x', entityId: 'a' }),
      'invalid-action-entity-type',
    );
    await expectValidationMessage(
      service.create({ title: 'x', entityType: 'CONTENT' }),
      'action-entity-id-required',
    );
  });

  it('update 仅在显式传入时改写实体引用（缺省保持原值）', async () => {
    const { service } = createActionHarness();
    const action = await service.create({ title: 'x', entityType: 'CONTENT', entityId: 'a' });
    // 只改 plannedDate：实体引用保持不变
    await expect(service.update(action.id, { plannedDate: '2026-09-21' })).resolves.toMatchObject({
      entityType: 'CONTENT',
      entityId: 'a',
    });
    // 显式传入空串视为清除
    await expect(service.update(action.id, { entityType: '', entityId: '' })).resolves.toMatchObject({
      entityType: null,
      entityId: null,
    });
  });

  it('删除排期只删 Action 行；删除不存在的排期报 action-not-found', async () => {
    const { service, records } = createActionHarness();
    const action = await service.create({ title: 'x', entityType: 'CONTENT', entityId: 'a' });
    await expect(service.remove(action.id)).resolves.toEqual({ id: action.id });
    expect(records.find((record) => record.id === action.id)).toBeUndefined();
    await expectValidationMessage(service.remove('ghost'), 'action-not-found');
  });

  it('删除排期不改 content/log 任何字节（PRD §4.4 末条）', async () => {
    const logDir = path.resolve(process.cwd(), '../../content/log');
    const snap = () =>
      fs
        .readdirSync(logDir)
        .sort()
        .map((name) => {
          const full = path.join(logDir, name);
          const st = fs.statSync(full);
          if (!st.isFile()) return `${name}:dir`;
          return `${name}:${st.size}:${fs.readFileSync(full, 'utf8')}`;
        })
        .join('\n');
    const before = snap();
    const { service } = createActionHarness();
    const action = await service.create({
      title: '发这篇',
      entityType: 'CONTENT',
      entityId: 'dorazoom',
      plannedDate: '2026-09-20',
    });
    await service.remove(action.id);
    expect(snap()).toBe(before);
  });
});
