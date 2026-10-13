import 'reflect-metadata';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { ConversationActionService } from './conversation-action.service';
import { ActionService } from '../action/action.service';
import { ACTION_REPOSITORY, type ActionRepositoryPort } from '../ports/action.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { newId } from '../common/ids';

const TAG = 'o05-';
let app: TestingModule;
let service: ConversationActionService;
let actions: ActionService;
let actionRepo: ActionRepositoryPort;
let contentDir: string;
let db: NonNullable<ReturnType<PrismaPort['getClient']>>;
/** 需要在保留期内可见的会话（createdAt 取近期） */
const conversations: string[] = [];

async function seedConversation(input: {
  id: string;
  contentSlug: string;
  visitorBody: string;
  createdAt?: Date;
}) {
  const createdAt = input.createdAt ?? new Date();
  // 真实 schema：anonId 必填；contentSlug 由 scopeSlug 映射（repository 的 contentSlug = scopeSlug）
  const conversation = await db.conversation.create({
    data: {
      id: input.id,
      anonId: `anon-${input.id}`,
      placementKey: 'article-inline',
      scopeSlug: input.contentSlug,
      createdAt,
      updatedAt: createdAt,
    },
  });
  const turn = await db.conversationTurn.create({
    data: { id: newId(), conversationId: conversation.id, seq: 1, requestKey: newId(), createdAt },
  });
  const message = await db.conversationMessage.create({
    data: {
      id: newId(),
      turnId: turn.id,
      role: 'visitor',
      body: input.visitorBody,
      delivery: 'sent',
      createdAt,
    },
  });
  const answer = await db.conversationMessage.create({
    data: {
      id: newId(),
      turnId: turn.id,
      role: 'assistant',
      body: '这是助手回答，不应被搬进事项。',
      delivery: 'sent',
      createdAt,
    },
  });
  conversations.push(conversation.id);
  return { conversationId: conversation.id, visitorMessageId: message.id, assistantMessageId: answer.id };
}

describe('O05 访客问题转更新事项', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-o05-content-'));
    process.env.WALKER_ADMIN_TOKEN = 'o05-token';
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.AI_ENABLED = 'false';
    delete process.env.WALKER_RESTORE_GATE_FILE;

    app = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] }).compile();
    await app.init();
    service = app.get(ConversationActionService);
    actions = app.get(ActionService);
    actionRepo = app.get(ACTION_REPOSITORY);
    db = app.get<PrismaPort>(PRISMA).getClient()!;
  });

  afterAll(async () => {
    if (db) {
      // 必须清掉本次造的墓碑：它会被其它测试（快照/恢复核对）当作全局事实读取，
      // 残留在共享测试库里会污染它们。这是我在 O05 里引入的真实缺陷。
      await db.deletionTombstone.deleteMany({ where: { conversationId: { in: conversations } } });
      await db.auditRecord.deleteMany({ where: { targetId: { startsWith: TAG } } });
      await db.reminderOccurrence.deleteMany({ where: { actionId: { startsWith: TAG } } });
      await db.action.deleteMany({ where: { id: { startsWith: TAG } } });
      await db.conversationMessage.deleteMany({ where: { turn: { conversationId: { in: conversations } } } });
      await db.conversationTurn.deleteMany({ where: { conversationId: { in: conversations } } });
      await db.conversation.deleteMany({ where: { id: { in: conversations } } });
    }
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    delete process.env.WALKER_ADMIN_TOKEN;
    delete process.env.CONTENT_LOG_DIR;
  });

  it('预览零写入：给出建议摘要与消息引用，不创建任何事项', async () => {
    const seeded = await seedConversation({
      id: `${TAG}preview`, contentSlug: 'post-preview',
      visitorBody: '这个方法在小店里也能用吗？我想知道具体怎么落地。',
    });
    const before = await db.action.count();

    const preview = await service.preview(seeded.conversationId);

    expect(preview.contentSlug).toBe('post-preview');
    expect(preview.title).toContain('回应访客');
    expect(preview.summary).toContain('小店');
    expect(preview.messageIds).toEqual([seeded.visitorMessageId]);
    // 零写入
    expect(await db.action.count()).toBe(before);
  });

  it('转事项只存摘要与引用，不复制完整会话、不含助手回答', async () => {
    const seeded = await seedConversation({
      id: `${TAG}convert`, contentSlug: 'post-convert',
      visitorBody: '请问这个结论还成立吗？我照着做失败了。',
    });

    const result = await service.convert({
      conversationId: seeded.conversationId,
      title: `${TAG}回应访客问题`,
      messageIds: [seeded.visitorMessageId],
      requestKey: `${TAG}req-convert`,
    });

    expect(result.replayed).toBe(false);
    const action = result.action;
    expect(action.entityType).toBe('CONVERSATION');
    expect(action.entityId).toBe(seeded.conversationId);
    expect(action.source).toBe('HUMAN');
    expect(action.evidenceRef).toMatchObject({
      conversationId: seeded.conversationId,
      messageIds: [seeded.visitorMessageId],
    });

    // 事项自身不含会话正文（只存标题/备注，正文留在会话表里）
    expect(action.title).not.toContain('我照着做失败了');
    expect(action.note).toBeNull();
    await db.action.delete({ where: { id: action.id } });
  });

  it('幂等：同 requestKey 重放返回同一条事项，不建第二条', async () => {
    const seeded = await seedConversation({
      id: `${TAG}idem`, contentSlug: 'post-idem', visitorBody: '重复提交测试',
    });
    const key = `${TAG}req-idem`;

    const first = await service.convert({
      conversationId: seeded.conversationId, title: `${TAG}幂等事项`, requestKey: key,
    });
    const second = await service.convert({
      conversationId: seeded.conversationId, title: `${TAG}幂等事项`, requestKey: key,
    });

    expect(second.replayed).toBe(true);
    expect(second.action?.id).toBe(first.action.id);
    // 该会话只对应一条事项
    const count = await db.action.count({ where: { entityId: seeded.conversationId } });
    expect(count).toBe(1);
  });

  it('审计写入失败时事项与幂等事实一起回滚', async () => {
    const seeded = await seedConversation({
      id: `${TAG}audit-failure`, contentSlug: 'post-audit-failure', visitorBody: '需要一条可追踪的更新事项',
    });
    const before = await db.action.count({ where: { entityId: seeded.conversationId } });
    await db.$executeRawUnsafe(`
      CREATE TRIGGER "o05_fail_conversion_audit"
      BEFORE INSERT ON "AuditRecord"
      WHEN NEW.action = 'conversation.convert'
      BEGIN SELECT RAISE(ABORT, 'forced-conversion-audit-failure'); END;
    `);
    let after = -1;
    try {
      await expect(service.convert({
        conversationId: seeded.conversationId,
        title: `${TAG}审计失败回滚`, requestKey: `${TAG}req-audit-failure`,
      })).rejects.toThrow();
      after = await db.action.count({ where: { entityId: seeded.conversationId } });
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "o05_fail_conversion_audit"');
      await db.action.deleteMany({ where: { entityId: seeded.conversationId } });
    }
    expect(after).toBe(before);
  });

  it('并发同键转换只提交一条事项，随后同键重试返回它', async () => {
    const seeded = await seedConversation({
      id: `${TAG}concurrent`, contentSlug: 'post-concurrent', visitorBody: '并发转换只应创建一条事项',
    });
    const input = {
      conversationId: seeded.conversationId,
      title: `${TAG}并发事项`, requestKey: `${TAG}req-concurrent`,
    };
    const outcomes = await Promise.allSettled([service.convert(input), service.convert(input)]);
    const replay = await service.convert(input);
    const rows = await db.action.findMany({ where: { entityId: seeded.conversationId } });
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(2);
    expect(rows).toHaveLength(1);
    expect(replay).toMatchObject({ replayed: true, action: { id: rows[0]?.id } });
    await db.auditRecord.deleteMany({ where: { targetId: rows[0]!.id } });
    await db.action.delete({ where: { id: rows[0]!.id } });
  });

  it('可从事项追到保留期内证据：正文可取回', async () => {
    const seeded = await seedConversation({
      id: `${TAG}evidence`, contentSlug: 'post-evidence',
      visitorBody: '保留期内的原始问题正文',
    });
    const { action } = await service.convert({
      conversationId: seeded.conversationId, title: `${TAG}证据事项`,
      messageIds: [seeded.visitorMessageId], requestKey: `${TAG}req-evidence`,
    });

    const evidence = await service.evidence(action.id);
    expect(evidence.available).toBe(true);
    expect(evidence.reason).toBeNull();
    expect(evidence.contentSlug).toBe('post-evidence');
    expect(evidence.messages).toHaveLength(1);
    expect(evidence.messages[0]!.body).toBe('保留期内的原始问题正文');
    expect(evidence.messages[0]!.role).toBe('visitor');
    // 助手回答没被引用
    expect(evidence.messages.some((m) => m.role === 'assistant')).toBe(false);
  });

  it('会话被删除后：证据显示不可用（deleted），事项仍保留', async () => {
    const seeded = await seedConversation({
      id: `${TAG}deleted`, contentSlug: 'post-deleted', visitorBody: '即将被删除的会话',
    });
    const { action } = await service.convert({
      conversationId: seeded.conversationId, title: `${TAG}删除后证据`,
      requestKey: `${TAG}req-deleted`,
    });

    // 模拟访客行使删除权：写入墓碑（与既有删除流一致的判定依据）
    await db.deletionTombstone.create({
      data: { id: newId(), conversationId: seeded.conversationId },
    });

    const replay = await service.convert({
      conversationId: seeded.conversationId, title: `${TAG}删除后证据`, requestKey: `${TAG}req-deleted`,
    });
    expect(replay).toMatchObject({ replayed: true, action: { id: action.id } });

    const evidence = await service.evidence(action.id);
    expect(evidence.available).toBe(false);
    expect(evidence.reason).toBe('deleted');
    expect(evidence.messages).toEqual([]);
    // 关键：事项本身仍在，站主要做的事没被会话删除带走
    expect(await actionRepo.findById(action.id)).not.toBeNull();
  });

  it('会话超出保留期后：证据显示不可用（expired），不以旧正文充数', async () => {
    // 造一段很久以前的会话（超出默认保留期）
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const seeded = await seedConversation({
      id: `${TAG}expired`, contentSlug: 'post-expired',
      visitorBody: '很久以前的访客问题正文', createdAt: old,
    });
    // 直接落一条带证据引用的事项（该会话已过期，无法经 convert 建——那正是保留期的效果）
    const action = await actionRepo.create({
      id: `${TAG}expired-action`,
      title: `${TAG}过期证据`,
      note: null,
      kind: 'TASK',
      entityType: 'CONVERSATION',
      entityId: seeded.conversationId,
      plannedDate: null,
      dueAt: null,
      timezone: null,
      source: 'HUMAN',
      evidenceRef: {
        conversationId: seeded.conversationId,
        messageIds: [seeded.visitorMessageId],
        capturedAt: new Date().toISOString(),
      },
    });

    const evidence = await service.evidence(action.id);
    expect(evidence.available).toBe(false);
    expect(evidence.reason).toBe('expired');
    expect(evidence.messages).toEqual([]);
  });

  it('过期会话无法被转成事项（保留期口径与 records 一致）', async () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const seeded = await seedConversation({
      id: `${TAG}old`, contentSlug: 'post-old', visitorBody: '过期会话', createdAt: old,
    });
    await expect(service.convert({
      conversationId: seeded.conversationId, title: `${TAG}过期转换`,
      requestKey: `${TAG}req-old`,
    })).rejects.toThrow(/会话不可用/);
  });

  it('只接受该会话内真实存在的消息 id：伪造 id 被丢弃', async () => {
    const seeded = await seedConversation({
      id: `${TAG}forge`, contentSlug: 'post-forge', visitorBody: '伪造引用测试',
    });
    const { action } = await service.convert({
      conversationId: seeded.conversationId,
      title: `${TAG}伪造引用`,
      messageIds: ['not-a-real-message-id', seeded.visitorMessageId],
      requestKey: `${TAG}req-forge`,
    });
    expect(action.evidenceRef?.messageIds).toEqual([seeded.visitorMessageId]);
  });

  it('转事项不授予 AI 写权限：授权数量与内容写能力都不变', async () => {
    const seeded = await seedConversation({
      id: `${TAG}grant`, contentSlug: 'post-grant', visitorBody: '权限不变测试',
    });
    const grantsBefore = await db.authorizationGrant.count();
    const changesBefore = await db.contentChange.count();

    const { action } = await service.convert({
      conversationId: seeded.conversationId, title: `${TAG}权限事项`,
      requestKey: `${TAG}req-grant`,
    });

    // 不新增任何授权；不产生内容候选
    expect(await db.authorizationGrant.count()).toBe(grantsBefore);
    expect(await db.contentChange.count()).toBe(changesBefore);
    expect(action.source).toBe('HUMAN');
  });

  it('参数校验：缺会话 id / requestKey、会话不存在均被拒绝', async () => {
    await expect(service.convert({ title: 'x', requestKey: 'k1' }))
      .rejects.toThrow(/conversation-id-required/);
    await expect(service.convert({ conversationId: `${TAG}x`, title: 'x' }))
      .rejects.toThrow(/conversation-action-request-key-required/);
    await expect(service.convert({ conversationId: 'no-such-conversation', title: 'x', requestKey: 'k2' }))
      .rejects.toThrow(/会话不可用/);
    await expect(service.evidence('no-such-action')).rejects.toThrow(/事项不存在/);
  });

  it('转事项会带上排期与到期瞬时（复用共享时间规则）', async () => {
    const seeded = await seedConversation({
      id: `${TAG}due`, contentSlug: 'post-due', visitorBody: '排期事项',
    });
    const { action } = await service.convert({
      conversationId: seeded.conversationId, title: `${TAG}排期事项`,
      plannedDate: '2026-10-15', requestKey: `${TAG}req-due`,
    });
    expect(action.plannedDate).toBe('2026-10-15');
    expect(action.timezone).toBe('Asia/Shanghai');
    expect(action.dueAt?.toISOString()).toBe('2026-10-14T16:00:00.000Z');
  });
});
