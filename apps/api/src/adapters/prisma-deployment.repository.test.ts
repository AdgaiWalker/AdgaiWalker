import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { READ_ONLY_PROFILE } from '@walker/shared';
import type { PrismaPort } from '../ports/prisma.port';
import { PrismaDeploymentRepository } from './prisma-deployment.repository';

const AGENT = 'v04-agent';
const REV1 = 'v04-rev-1';
const REV2 = 'v04-rev-2';
const DEP = 'v04-deploy';

let db: PrismaClient;
let repo: PrismaDeploymentRepository;

beforeAll(async () => {
  db = new PrismaClient();
  const prismaPort: PrismaPort = { getClient: () => db } as PrismaPort;
  repo = new PrismaDeploymentRepository(prismaPort);
  await db.agentUnit.create({ data: { id: AGENT, name: 'V04', prompt: '只读 v1' } });
  await db.agentRevision.create({ data: { id: REV1, agentId: AGENT, version: 1, prompt: '只读 v1', modelId: 'deepseek-chat', toolProfile: READ_ONLY_PROFILE, schemaVersion: 1, configHash: 'a'.repeat(64) } });
  await db.agentRevision.create({ data: { id: REV2, agentId: AGENT, version: 2, prompt: '只读 v2 草稿', modelId: 'deepseek-chat', toolProfile: READ_ONLY_PROFILE, schemaVersion: 1, configHash: 'b'.repeat(64) } });
});

afterAll(async () => {
  await db?.deploymentMember.deleteMany({ where: { deployment: { placementKey: { startsWith: 'v04-' } } } });
  await db?.agentDeployment.deleteMany({ where: { placementKey: { startsWith: 'v04-' } } });
  await db?.auditRecord.deleteMany({ where: { targetType: 'deployment' } });
  await db?.agentRevision.deleteMany({ where: { agentId: AGENT } });
  await db?.agentUnit.deleteMany({ where: { id: AGENT } });
  await db?.$disconnect();
});

describe('PrismaDeploymentRepository（V04 位置绑定）', () => {
  it('恰一个默认成员才能保存：两个默认或零默认都拒绝', async () => {
    await expect(
      repo.save({
        deploymentId: `${DEP}-two-default`, actor: 'owner', requestId: 'v04-r1',
        placementKey: 'v04-post', scopeKind: 'post', scopeSlug: 'a',
        members: [
          { agentRevisionId: REV1, isDefault: true },
          { agentRevisionId: REV2, isDefault: true },
        ],
        expectedGeneration: null,
      }),
    ).rejects.toMatchObject({ response: { code: 'deployment-default-required' } });

    await expect(
      repo.save({
        deploymentId: `${DEP}-no-default`, actor: 'owner', requestId: 'v04-r2',
        placementKey: 'v04-post', scopeKind: 'post', scopeSlug: 'a',
        members: [{ agentRevisionId: REV1, isDefault: false }],
        expectedGeneration: null,
      }),
    ).rejects.toMatchObject({ response: { code: 'deployment-default-required' } });

    const created = await repo.save({
      deploymentId: DEP, actor: 'owner', requestId: 'v04-r3',
      placementKey: 'v04-post', scopeKind: 'post', scopeSlug: 'a',
      members: [
        { agentRevisionId: REV1, isDefault: true },
        { agentRevisionId: REV2, isDefault: false },
      ],
      expectedGeneration: null,
    });
    expect(created.generation).toBe(1);
    expect(created.enabled).toBe(false);
    expect(created.members.find((m) => m.isDefault)?.agentRevisionId).toBe(REV1);
  });

  it('幂等键重复提交同内容返回同一部署；不同内容拒绝', async () => {
    const again = await repo.save({
      deploymentId: DEP, actor: 'owner', requestId: 'v04-r4',
      placementKey: 'v04-post', scopeKind: 'post', scopeSlug: 'a',
      members: [
        { agentRevisionId: REV1, isDefault: true },
        { agentRevisionId: REV2, isDefault: false },
      ],
      expectedGeneration: null,
    });
    expect(again.id).toBe(DEP);
    expect(again.generation).toBe(1);

    await expect(
      repo.save({
        deploymentId: DEP, actor: 'owner', requestId: 'v04-r5',
        placementKey: 'v04-post', scopeKind: 'post', scopeSlug: 'other',
        members: [{ agentRevisionId: REV1, isDefault: true }],
        expectedGeneration: null,
      }),
    ).rejects.toMatchObject({ response: { code: 'idempotency-conflict' } });
  });

  it('更新走 generation CAS：旧 generation 冲突，正确 generation 更新成功且成员替换', async () => {
    await expect(
      repo.save({
        deploymentId: `${DEP}-update-stale`, actor: 'owner', requestId: 'v04-r6',
        placementKey: 'v04-post', scopeKind: 'post', scopeSlug: 'a',
        members: [{ agentRevisionId: REV2, isDefault: true }],
        expectedGeneration: 99,
      }),
    ).rejects.toMatchObject({ response: { code: 'revision-conflict' } });

    const updated = await repo.save({
      deploymentId: `${DEP}-update`, actor: 'owner', requestId: 'v04-r7',
      placementKey: 'v04-post', scopeKind: 'post', scopeSlug: 'a',
      members: [{ agentRevisionId: REV2, isDefault: true }],
      expectedGeneration: 1,
    });
    expect(updated.generation).toBe(2);
    expect(updated.members).toHaveLength(1);
    expect(updated.members[0]!.agentRevisionId).toBe(REV2);
  });

  it('启用/禁用走 CAS；禁用保留历史成员；已部署修订不被草稿变化覆盖', async () => {
    await expect(repo.setEnabled({ id: DEP, enabled: true, expectedGeneration: 1, actor: 'owner', requestId: 'v04-r8' }))
      .rejects.toMatchObject({ response: { code: 'revision-conflict' } });

    const enabled = await repo.setEnabled({ id: DEP, enabled: true, expectedGeneration: 2, actor: 'owner', requestId: 'v04-r9' });
    expect(enabled.enabled).toBe(true);
    expect(enabled.generation).toBe(3);

    await expect(repo.save({
      deploymentId: `${DEP}-bypass`, actor: 'owner', requestId: 'v04-bypass',
      placementKey: 'v04-post', scopeKind: 'post', scopeSlug: 'a',
      members: [{ agentRevisionId: REV1, isDefault: true }], expectedGeneration: 3,
    })).rejects.toMatchObject({ response: { code: 'deployment-enabled' } });
    expect((await repo.detail(DEP))?.members[0]?.agentRevisionId).toBe(REV2);

    const disabled = await repo.setEnabled({ id: DEP, enabled: false, expectedGeneration: 3, actor: 'owner', requestId: 'v04-r10' });
    expect(disabled.enabled).toBe(false);
    expect(disabled.members).toHaveLength(1);

    // 之后产生新的草稿修订（v3），已部署成员仍钉住 v2；部署引用不被草稿变化覆盖
    await db.agentRevision.create({ data: { id: 'v04-rev-3', agentId: AGENT, version: 3, prompt: 'v3 新草稿', modelId: 'deepseek-chat', toolProfile: READ_ONLY_PROFILE, schemaVersion: 1, configHash: 'c'.repeat(64) } });
    const detail = await repo.detail(DEP);
    expect(detail?.members[0]?.agentRevisionId).toBe(REV2);
    expect(detail?.members[0]?.revision).toBe(2);
    expect(detail?.members.some((m) => m.agentRevisionId === 'v04-rev-3')).toBe(false);
    const pinned = await db.agentRevision.findUniqueOrThrow({ where: { id: REV2 } });
    expect(pinned.prompt).toBe('只读 v2 草稿');
  });

  it('成员引用不存在的修订拒绝', async () => {
    await expect(
      repo.save({
        deploymentId: `${DEP}-missing`, actor: 'owner', requestId: 'v04-r11',
        placementKey: 'v04-post', scopeKind: 'post', scopeSlug: 'missing',
        members: [{ agentRevisionId: 'no-such-revision', isDefault: true }],
        expectedGeneration: null,
      }),
    ).rejects.toMatchObject({ response: { code: 'revision-not-found' } });
  });
});
