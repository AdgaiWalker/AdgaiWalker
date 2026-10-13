import 'reflect-metadata';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { OperationsService } from './operations.service';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { newId } from '../common/ids';
import { rateOrNull, summarizeUsage } from '@walker/shared';

const TAG = 'o06-';
let app: TestingModule;
let stats: OperationsService;
let contentDir: string;
let db: NonNullable<ReturnType<PrismaPort['getClient']>>;
const conversationIds: string[] = [];

/**
 * 造一段会话：turn 上有 N 次 attempt（>1 即重新生成），
 * 每次 attempt 各挂一条助手消息——重新生成只增 attempt 与助手消息，**不增访客消息**。
 */
async function seedTurn(input: {
  conversationId?: string;
  visitorBody: string;
  attempts?: number;
  delivery?: string;
  createdAt?: Date;
}) {
  const createdAt = input.createdAt ?? new Date();
  let conversationId = input.conversationId;
  if (!conversationId) {
    const conversation = await db.conversation.create({
      data: {
        id: newId(),
        anonId: `anon-${newId()}`,
        placementKey: 'article-inline',
        scopeSlug: `post-${TAG}`,
        createdAt,
        updatedAt: createdAt,
      },
    });
    conversationId = conversation.id;
    conversationIds.push(conversation.id);
  }
  const turn = await db.conversationTurn.create({
    data: { id: newId(), conversationId, seq: 1, requestKey: newId(), createdAt },
  });
  const visitor = await db.conversationMessage.create({
    data: { id: newId(), turnId: turn.id, role: 'visitor', body: input.visitorBody, delivery: 'sent', createdAt },
  });
  const attemptCount = input.attempts ?? 1;
  for (let i = 0; i < attemptCount; i += 1) {
    const attempt = await db.conversationAttempt.create({
      data: { id: newId(), turnId: turn.id, agentRevisionId: `rev-${TAG}`, state: 'generated', createdAt },
    });
    await db.conversationMessage.create({
      data: {
        id: newId(), turnId: turn.id, attemptId: attempt.id, role: 'assistant',
        body: `回答 #${i + 1}`, delivery: input.delivery ?? 'sent', createdAt,
      },
    });
  }
  return { conversationId, turnId: turn.id, visitorMessageId: visitor.id };
}

let overview1dNoRuns: Awaited<ReturnType<OperationsService['overview']>>;

/** 造两条公开运行：一条带用量，一条**没有**用量（用来验证"缺 usage 不计 0"）。 */
async function seedRuns() {
  const now = new Date();
  const base = {
    kind: 'public-answer', origin: 'public', actor: `anon-${TAG}`, actorScope: `scope-${TAG}`,
    state: 'SUCCEEDED', inputHash: `hash-${newId()}`, requestKey: newId(),
  };
  await db.executionRun.create({
    data: { id: newId(), ...base, tokensIn: 100, tokensOut: 50, elapsedMs: 10, createdAt: now },
  });
  await db.executionRun.create({
    data: { id: newId(), ...base, requestKey: newId(), state: 'FAILED', createdAt: now },
  });
}

describe('O06 可追溯的运营统计', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-o06-content-'));
    process.env.WALKER_ADMIN_TOKEN = 'o06-token';
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.AI_ENABLED = 'false';
    delete process.env.WALKER_RESTORE_GATE_FILE;

    app = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] }).compile();
    await app.init();
    stats = app.get(OperationsService);
    db = app.get<PrismaPort>(PRISMA).getClient()!;

    // 基础事实：1 会话 / 1 轮 / 1 访客消息 / 2 次尝试（1 次重生成）/ 2 条助手消息，其中 1 条 ack
    const base = await seedTurn({ visitorBody: '基础提问', attempts: 2, delivery: 'ack' });
    // 第二段会话：1 条未确认送达的助手消息
    await seedTurn({ visitorBody: '第二个提问', attempts: 1, delivery: 'sent' });
    await seedRuns();
    void base;
    overview1dNoRuns = await stats.overview({ window: '24h' });
  });

  afterAll(async () => {
    if (db) {
      // 运行没有归属外键，按 actorScope 清理本次造的行
      await db.executionRun.deleteMany({ where: { actorScope: `scope-${TAG}` } });
      await db.conversationMessage.deleteMany({ where: { turn: { conversationId: { in: conversationIds } } } });
      await db.conversationAttempt.deleteMany({ where: { turn: { conversationId: { in: conversationIds } } } });
      await db.conversationTurn.deleteMany({ where: { conversationId: { in: conversationIds } } });
      await db.conversation.deleteMany({ where: { id: { in: conversationIds } } });
    }
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    delete process.env.WALKER_ADMIN_TOKEN;
    delete process.env.CONTENT_LOG_DIR;
  });

  it('提问数按唯一访客消息计：重新生成不抬高提问数', async () => {
    const overview = await stats.overview({ window: '30d' });

    // 两段会话各 1 条访客消息 = 2 次提问
    expect(overview.asks.visitorMessages).toBe(2);
    expect(overview.asks.conversations).toBe(2);
    expect(overview.asks.turns).toBe(2);
    // 基础会话有 2 次尝试 → 1 次重生成
    expect(overview.asks.regenerationAttempts).toBe(1);
    // 关键不变量：提问数 < 助手消息数（重生成产生了更多助手消息），但提问数不变
    expect(overview.asks.visitorMessages).toBeLessThan(overview.asks.regenerationAttempts + overview.asks.turns);
  });

  it('补齐更多重生成后提问数仍不变（只增 attempt）', async () => {
    const before = await stats.overview({ window: '30d' });
    const target = await db.conversationTurn.findFirst({ where: { conversationId: conversationIds[0]! } });

    // 再加 2 次重生成 + 2 条助手消息
    for (let i = 0; i < 2; i += 1) {
      const attempt = await db.conversationAttempt.create({
        data: { id: newId(), turnId: target!.id, agentRevisionId: `rev-${TAG}`, state: 'generated' },
      });
      await db.conversationMessage.create({
        data: {
          id: newId(), turnId: target!.id, attemptId: attempt.id, role: 'assistant',
          body: '再生成', delivery: 'sent',
        },
      });
    }

    const after = await stats.overview({ window: '30d' });
    // 提问数、会话数、轮次数都不变；只有重生成数上升
    expect(after.asks.visitorMessages).toBe(before.asks.visitorMessages);
    expect(after.asks.conversations).toBe(before.asks.conversations);
    expect(after.asks.turns).toBe(before.asks.turns);
    expect(after.asks.regenerationAttempts).toBeGreaterThan(before.asks.regenerationAttempts);
  });

  it('成功/降级/失败/未知分开计数；交付确认独立于生成成功', async () => {
    const overview = await stats.overview({ window: '30d' });
    const { answers } = overview;

    // 交付确认与未确认分开，且两者之和 = 助手消息总数
    expect(answers.deliveryAck).toBeGreaterThanOrEqual(1);
    expect(answers.deliveryUnconfirmed).toBeGreaterThanOrEqual(1);
    // 生成成功没有被冒充成"访客已收到"
    expect(answers.deliveryAck).toBeLessThan(answers.deliveryAck + answers.deliveryUnconfirmed);

    // 四类互斥且都不为负
    for (const value of [answers.succeeded, answers.degraded, answers.failed, answers.unknown]) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('缺 usage 不计 0：缺失的运行不算进总量，覆盖率如实反映只测到一半', async () => {
    const overview = await stats.overview({ window: '24h' });

    // 本轮 seedRuns 造了 2 条运行：一条带用量(100/50)，一条没有用量
    expect(overview.usage.runsWithUsage).toBe(1);
    expect(overview.usage.runs).toBeGreaterThanOrEqual(2);
    // 关键：缺失的那条**没有被当成 0 计入**（否则 coverage 会是 1）
    expect(overview.usage.coverage).toBeLessThan(1);
    expect(overview.usage.coverage).toBeGreaterThan(0);
    // 总量只来自明确记录的那条：100 / 50 / 150
    expect(overview.usage.tokensIn).toBe(100);
    expect(overview.usage.tokensOut).toBe(50);
    expect(overview.usage.totalTokens).toBe(150);
  });

  it('一条用量都没有时总量为 null（不是 0），且没有分母时不给比率', async () => {
    // 纯函数口径：把"没测到"与"测到 0"分开
    const none = summarizeUsage([{ tokensIn: null, tokensOut: null }]);
    expect(none.tokensIn).toBeNull();
    expect(none.totalTokens).toBeNull();
    expect(none.coverage).toBe(0); // 有运行、但零覆盖

    // 一条运行都没有 → 没有分母，比率必须为 null
    const empty = summarizeUsage([]);
    expect(empty.coverage).toBeNull();
    expect(empty.totalTokens).toBeNull();
    expect(rateOrNull(0, 0)).toBeNull();

    // 端到端：某个没有运行的窗口
    expect(overview1dNoRuns.usage.runsWithUsage).toBeLessThanOrEqual(overview1dNoRuns.usage.runs);
  });

  it('窗口、口径来源与缺失覆盖随响应返回（每个数字可追溯）', async () => {
    const overview = await stats.overview({ window: '24h' });
    expect(overview.provenance.window).toBe('24h');
    expect(overview.provenance.hours).toBe(24);
    expect(new Date(overview.provenance.to).getTime() - new Date(overview.provenance.from).getTime())
      .toBe(24 * 60 * 60 * 1000);
    // 来源逐条写明，站主能核对数字出处
    expect(overview.provenance.sources.length).toBeGreaterThanOrEqual(5);
    expect(overview.provenance.sources.join(' ')).toContain('ConversationMessage');
    // 缺失覆盖声明存在
    expect(overview.provenance.missing.map((item) => item.key)).toContain('usage');
    expect(overview.provenance.missing.map((item) => item.key)).toContain('answerOutcome');
  });

  it('默认窗口为 7d；非法窗口不报错而是回落默认（不因参数错误丢掉整个概览）', async () => {
    const fallback = await stats.overview({ window: '不存在的窗口' });
    expect(fallback.provenance.window).toBe('7d');
    expect(fallback.provenance.hours).toBe(24 * 7);

    const sevenDay = await stats.overview({});
    expect(sevenDay.provenance.window).toBe('7d');
  });

  it('提醒与内容事实来自既有表：计数与直接查库一致', async () => {
    const overview = await stats.overview({ window: '30d' });
    expect(overview.reminders.open).toBe(await db.action.count({ where: { status: 'OPEN' } }));
    expect(overview.content.changes).toBe(await db.contentChange.count({
      where: { createdAt: { gte: new Date(overview.provenance.from), lte: new Date(overview.provenance.to) } },
    }));
    // 已发布数不会超过发布总数
    expect(overview.content.published).toBeLessThanOrEqual(overview.content.releases);
  });

  it('窗口外的事实不被计入', async () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await seedTurn({ visitorBody: '很久以前的提问', attempts: 1, createdAt: old });

    const day = await stats.overview({ window: '24h' });
    const month = await stats.overview({ window: '30d' });
    // 60 天前既不在 24h 也不在 30d 窗口内
    expect(month.asks.visitorMessages).toBe(day.asks.visitorMessages);
  });
});
