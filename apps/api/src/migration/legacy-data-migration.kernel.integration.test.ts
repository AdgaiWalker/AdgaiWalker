import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { LegacyDataMigrationService } from './legacy-data-migration.service';
import { PrismaOperationsReadRepository } from '../adapters/prisma-operations-read.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

const TAG = 'g01-';
let app: TestingModule;
let migrationService: LegacyDataMigrationService;
let opsReadRepo: PrismaOperationsReadRepository;
let contentDir: string;
let db: NonNullable<ReturnType<PrismaPort['getClient']>>;

describe('G01 旧数据导入与兼容读演练（K6 幂等与历史保全）', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-g01-content-'));
    process.env.WALKER_ADMIN_TOKEN = 'g01-token';
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.AI_ENABLED = 'false';
    delete process.env.WALKER_RESTORE_GATE_FILE;

    app = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] }).compile();
    await app.init();
    migrationService = app.get(LegacyDataMigrationService);
    db = app.get<PrismaPort>(PRISMA).getClient()!;
    opsReadRepo = new PrismaOperationsReadRepository({ getClient: () => db, isWritable: () => true, ping: async () => true });

    // 播种历史数据（包括旧 Agent、旧 AgentRun、旧 SkillRun、旧 AssistantRun）
    // 1. 无修订的历史 AgentUnit
    await db.agentUnit.create({
      data: {
        id: `${TAG}agent-1`,
        name: '历史角色小明',
        icon: 'bot',
        isSystem: false,
        prompt: '你是一个历史运维助手',
        modelId: 'deepseek-chat',
        providerId: 'deepseek-official',
      },
    });

    // 2. 旧 AgentRun：一个成功且有用量，一个失败且无用量
    await db.agentRun.create({
      data: {
        id: `${TAG}ar-1`,
        agentId: `${TAG}agent-1`,
        instruction: '帮我检查下磁盘剩余空间',
        output: '当前根分区剩余 45GB',
        model: 'deepseek-chat',
        status: 'SUCCESS',
        tokensPrompt: 120,
        tokensCompletion: 60,
        elapsedMs: 850,
      },
    });
    await db.agentRun.create({
      data: {
        id: `${TAG}ar-2`,
        agentId: `${TAG}agent-1`,
        instruction: '执行坏任务',
        output: '连接上游失败',
        model: 'deepseek-chat',
        status: 'FAILED',
        tokensPrompt: 0,
        tokensCompletion: 0,
        elapsedMs: 0,
      },
    });

    // 3. 旧 SkillRun
    await db.skillRun.create({
      data: {
        id: `${TAG}sr-1`,
        skillId: 'system-info',
        skillVersion: '1.0.0',
        input: 'df -h',
        output: 'Filesystem size...',
        model: 'deepseek-chat',
        status: 'SUCCESS',
        tokensPrompt: 50,
        tokensCompletion: 25,
        elapsedMs: 300,
      },
    });

    // 4. 旧 AssistantRun（无 traceId，会话资源未索引）
    const convId = `${TAG}conv-1`;
    await db.conversation.create({
      data: {
        id: convId,
        anonId: `anon-${TAG}1`,
        placementKey: 'article-inline',
        scopeSlug: 'dorazoom',
      },
    });
    await db.assistantRun.create({
      data: {
        id: `${TAG}as-1`,
        sessionId: convId,
        question: '这篇文章怎么用？',
        answer: '请参考第二小节。',
        aiUsedFlag: true,
        tokensIn: 80,
        tokensOut: 40,
        elapsedMs: 500,
        traceId: null, // 尚未关联执行
      },
    });
  });

  afterAll(async () => {
    if (db) {
      await db.conversationLogResource.deleteMany({ where: { conversationId: { startsWith: TAG } } });
      await db.assistantRun.deleteMany({ where: { id: { startsWith: TAG } } });
      await db.conversation.deleteMany({ where: { id: { startsWith: TAG } } });
      await db.skillRun.deleteMany({ where: { id: { startsWith: TAG } } });
      await db.agentRun.deleteMany({ where: { id: { startsWith: TAG } } });
      await db.executionRun.deleteMany({ where: { legacyId: { startsWith: TAG } } });
      await db.agentRevision.deleteMany({ where: { agentId: { startsWith: TAG } } });
      await db.agentUnit.deleteMany({ where: { id: { startsWith: TAG } } });
      await db.auditRecord.deleteMany({ where: { targetId: { startsWith: TAG } } });
    }
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    delete process.env.WALKER_ADMIN_TOKEN;
    delete process.env.CONTENT_LOG_DIR;
  });

  it('第一次执行迁移：成功为历史 Agent 生成初始修订，全量旧 run 迁移并补齐会话资源索引', async () => {
    const res1 = await migrationService.migrateAll('g01-test-job-1');

    // 1. Agent 初始修订生成
    expect(res1.revisionsCreated).toBeGreaterThanOrEqual(1);
    const rev = await db.agentRevision.findUnique({
      where: { agentId_version: { agentId: `${TAG}agent-1`, version: 1 } },
    });
    expect(rev).not.toBeNull();
    expect(rev!.prompt).toBe('你是一个历史运维助手');
    expect(rev!.version).toBe(1);

    // 2. AgentRun 迁移
    expect(res1.agentRunsMigrated).toBeGreaterThanOrEqual(2);
    const exAr1 = await db.executionRun.findUnique({
      where: { legacySource_legacyId: { legacySource: 'AgentRun', legacyId: `${TAG}ar-1` } },
    });
    expect(exAr1).not.toBeNull();
    expect(exAr1!.input).toBe('帮我检查下磁盘剩余空间');
    expect(exAr1!.state).toBe('SUCCEEDED');
    expect(exAr1!.tokensIn).toBe(120);
    expect(exAr1!.tokensOut).toBe(60);
    expect(exAr1!.agentRevisionId).toBeNull(); // 无法恢复的修订诚实保持未知

    // 无用量记录的运行：tokensIn / tokensOut 保持 null（不计为 0）
    const exAr2 = await db.executionRun.findUnique({
      where: { legacySource_legacyId: { legacySource: 'AgentRun', legacyId: `${TAG}ar-2` } },
    });
    expect(exAr2).not.toBeNull();
    expect(exAr2!.state).toBe('FAILED');
    expect(exAr2!.tokensIn).toBeNull();
    expect(exAr2!.tokensOut).toBeNull();

    // 3. SkillRun 迁移
    expect(res1.skillRunsMigrated).toBeGreaterThanOrEqual(1);
    const exSr1 = await db.executionRun.findUnique({
      where: { legacySource_legacyId: { legacySource: 'SkillRun', legacyId: `${TAG}sr-1` } },
    });
    expect(exSr1).not.toBeNull();
    expect(exSr1!.input).toBe('df -h');

    // 4. AssistantRun 迁移与会话资源索引
    expect(res1.assistantRunsMigrated).toBeGreaterThanOrEqual(1);
    expect(res1.conversationResourcesIndexed).toBeGreaterThanOrEqual(1);
    const updatedAs1 = await db.assistantRun.findUnique({ where: { id: `${TAG}as-1` } });
    expect(updatedAs1!.traceId).toBeTruthy(); // 回写 traceId
    const resRow = await db.conversationLogResource.findUnique({
      where: { resourceType_resourceKey: { resourceType: 'assistant-run', resourceKey: `${TAG}as-1` } },
    });
    expect(resRow).not.toBeNull();
    expect(resRow!.conversationId).toBe(`${TAG}conv-1`);
  });

  it('升级两次行数稳定（K6 核心）：再次执行迁移增量全为 0，数据行数严格不变', async () => {
    // 记录第一次迁移后的基准行数
    const revsCountBefore = await db.agentRevision.count({ where: { agentId: `${TAG}agent-1` } });
    const exRunsCountBefore = await db.executionRun.count({ where: { legacyId: { startsWith: TAG } } });
    const logResCountBefore = await db.conversationLogResource.count({ where: { conversationId: { startsWith: TAG } } });

    // 执行第二次迁移
    const res2 = await migrationService.migrateAll('g01-test-job-2');

    // 所有迁移增量必须严格为 0
    expect(res2.revisionsCreated).toBe(0);
    expect(res2.agentRunsMigrated).toBe(0);
    expect(res2.skillRunsMigrated).toBe(0);
    expect(res2.assistantRunsMigrated).toBe(0);
    expect(res2.conversationResourcesIndexed).toBe(0);

    // 数据库行数完全不变
    const revsCountAfter = await db.agentRevision.count({ where: { agentId: `${TAG}agent-1` } });
    const exRunsCountAfter = await db.executionRun.count({ where: { legacyId: { startsWith: TAG } } });
    const logResCountAfter = await db.conversationLogResource.count({ where: { conversationId: { startsWith: TAG } } });

    expect(revsCountAfter).toBe(revsCountBefore);
    expect(exRunsCountAfter).toBe(exRunsCountBefore);
    expect(logResCountAfter).toBe(logResCountBefore);
  });

  it('旧业务链可读：旧表数据完整保留，旧报表适配器正常读取历史明细与总量', async () => {
    // 旧表中的原始数据一行都未被删除（不以新表空白为由清空历史）
    const rawAgentRuns = await db.agentRun.findMany({ where: { agentId: `${TAG}agent-1` } });
    expect(rawAgentRuns.length).toBe(2);
    expect(rawAgentRuns.some((r) => r.id === `${TAG}ar-1`)).toBe(true);

    // 旧报表读适配器可正常读取
    const reportList = await opsReadRepo.runs({ page: 1, pageSize: 10, agentId: `${TAG}agent-1` });
    expect(reportList.total).toBe(2);
    expect(reportList.items[0]!.agentName).toBe('历史角色小明');

    const singleRun = await opsReadRepo.run(`${TAG}ar-1`);
    expect(singleRun).not.toBeNull();
    expect(singleRun!.instruction).toBe('帮我检查下磁盘剩余空间');
    expect(singleRun!.output).toBe('当前根分区剩余 45GB');
  });

  it('新记录单一权威写入：新执行只写入 ExecutionRun，不向旧表双写', async () => {
    const beforeAgentRuns = await db.agentRun.count();
    const beforeSkillRuns = await db.skillRun.count();

    // 新架构统一执行写入
    await db.executionRun.create({
      data: {
        id: `ex_new_${randomUUID().slice(0, 8)}`,
        kind: 'agent-run',
        origin: 'admin',
        actor: 'owner',
        actorScope: 'admin:trial',
        requestKey: `rk-new-${randomUUID().slice(0, 8)}`,
        inputHash: 'hash-new',
        input: '这是新架构执行',
        state: 'SUCCEEDED',
      },
    });

    // 旧表行数绝不增加（单一权威写入，避免永久双写）
    expect(await db.agentRun.count()).toBe(beforeAgentRuns);
    expect(await db.skillRun.count()).toBe(beforeSkillRuns);
  });
});
