import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export interface LegacyDataMigrationResult {
  agentsTotal: number;
  revisionsCreated: number;
  agentRunsTotal: number;
  agentRunsMigrated: number;
  skillRunsTotal: number;
  skillRunsMigrated: number;
  assistantRunsTotal: number;
  assistantRunsMigrated: number;
  conversationResourcesIndexed: number;
  durationMs: number;
}

/** 生成历史 Agent 初始修订的 configHash（对配置做稳定序列化后哈希） */
function legacyConfigHash(input: { prompt: string; providerId: string | null; modelId: string; toolProfile: unknown }): string {
  const stable = JSON.stringify({
    prompt: input.prompt,
    providerId: input.providerId,
    modelId: input.modelId,
    toolProfile: input.toolProfile,
    schemaVersion: 1,
  });
  return createHash('sha256').update(stable).digest('hex');
}

/**
 * G01 旧数据迁移核心（TECH-DESIGN §14）——**纯函数，零 Nest 装饰器**。
 *
 * 同一份逻辑供两处消费：
 * - `LegacyDataMigrationService`（Nest 注入版，挂在 kernel.module）；
 * - `scripts/migrate-legacy-data.ts`（CLI 直跑，无装饰器依赖）。
 *
 * 四条纪律：
 * 1. **幂等**：无论执行多少次，第二次运行新增行数恒为 0；
 * 2. **溯源与去重**：旧 run 以 (legacySource, legacyId) 唯一索引去重；
 * 3. **诚实未知**：无法恢复的修订（agentRevisionId）、未明确计量的 token 保持 null；
 * 4. **历史保全**：旧表（AgentRun/SkillRun/AssistantRun）只读保留，绝不删历史。
 */
export async function migrateLegacyData(
  db: PrismaClient,
  input: { idFactory: () => string; actor: string },
): Promise<LegacyDataMigrationResult> {
  const startedAt = Date.now();

  // ── 1. Agent：无修订的历史 AgentUnit 生成初始修订（version: 1）──
  const agentsTotal = await db.agentUnit.count();
  let revisionsCreated = 0;

  const agents = await db.agentUnit.findMany({ where: { archivedAt: null } });
  for (const agent of agents) {
    if (await db.agentRevision.count({ where: { agentId: agent.id } }) > 0) continue;

    const toolProfile = { readOnly: true };
    const configHash = legacyConfigHash({
      prompt: agent.prompt,
      providerId: agent.providerId,
      modelId: agent.modelId,
      toolProfile,
    });
    await db.agentRevision.create({
      data: {
        id: `legacy-${agent.id}`,
        agentId: agent.id,
        version: 1,
        prompt: agent.prompt,
        providerId: agent.providerId,
        modelId: agent.modelId,
        toolProfile,
        schemaVersion: 1,
        configHash,
      },
    });
    await db.auditRecord.create({
      data: {
        id: input.idFactory(),
        actor: input.actor,
        action: 'agent.import',
        targetType: 'agent',
        targetId: agent.id,
        outcome: 'imported',
        afterHash: configHash,
      },
    });
    revisionsCreated += 1;
  }

  // ── 2. AgentRun → ExecutionRun（legacySource: 'AgentRun'）──
  const agentRuns = await db.agentRun.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const agentRunsTotal = agentRuns.length;
  let agentRunsMigrated = 0;

  for (const run of agentRuns) {
    if (await db.executionRun.findFirst({
      where: { legacySource: 'AgentRun', legacyId: run.id },
      select: { id: true },
    })) continue;

    await db.executionRun.create({
      data: {
        id: `ex_ar_${run.id}`,
        kind: 'agent-run',
        origin: 'legacy',
        actor: 'owner',
        actorScope: 'legacy:agent-run',
        agentRevisionId: null, // 无法恢复的修订保持未知（纪律 3）
        requestKey: `legacy_agent_run_${run.id}`,
        inputHash: createHash('sha256').update(run.instruction).digest('hex'),
        input: run.instruction,
        state: run.status === 'SUCCESS' ? 'SUCCEEDED' : 'FAILED',
        tokensIn: run.tokensPrompt > 0 ? run.tokensPrompt : null,
        tokensOut: run.tokensCompletion > 0 ? run.tokensCompletion : null,
        elapsedMs: run.elapsedMs > 0 ? run.elapsedMs : null,
        legacySource: 'AgentRun',
        legacyId: run.id,
        createdAt: run.createdAt,
        updatedAt: run.createdAt,
      },
    });
    agentRunsMigrated += 1;
  }

  // ── 3. SkillRun → ExecutionRun（legacySource: 'SkillRun'）──
  const skillRuns = await db.skillRun.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const skillRunsTotal = skillRuns.length;
  let skillRunsMigrated = 0;

  for (const run of skillRuns) {
    if (await db.executionRun.findFirst({
      where: { legacySource: 'SkillRun', legacyId: run.id },
      select: { id: true },
    })) continue;

    await db.executionRun.create({
      data: {
        id: `ex_sr_${run.id}`,
        kind: 'skill-run',
        origin: 'legacy',
        actor: 'owner',
        actorScope: 'legacy:skill-run',
        agentRevisionId: null,
        requestKey: `legacy_skill_run_${run.id}`,
        inputHash: createHash('sha256').update(run.input).digest('hex'),
        input: run.input,
        state: run.status === 'SUCCESS' ? 'SUCCEEDED' : 'FAILED',
        stopReason: run.errorCode ?? null,
        tokensIn: run.tokensPrompt > 0 ? run.tokensPrompt : null,
        tokensOut: run.tokensCompletion > 0 ? run.tokensCompletion : null,
        elapsedMs: run.elapsedMs > 0 ? run.elapsedMs : null,
        legacySource: 'SkillRun',
        legacyId: run.id,
        createdAt: run.createdAt,
        updatedAt: run.createdAt,
      },
    });
    skillRunsMigrated += 1;
  }

  // ── 4. AssistantRun → ExecutionRun + 会话资源索引补齐 ──
  const assistantRuns = await db.assistantRun.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const assistantRunsTotal = assistantRuns.length;
  let assistantRunsMigrated = 0;
  let conversationResourcesIndexed = 0;

  for (const run of assistantRuns) {
    const existing = await db.executionRun.findFirst({
      where: { legacySource: 'AssistantRun', legacyId: run.id },
      select: { id: true },
    });
    const executionRunId = existing?.id ?? `ex_as_${run.id}`;

    if (!existing) {
      await db.executionRun.create({
        data: {
          id: executionRunId,
          kind: 'assistant-run',
          origin: 'public',
          actor: run.anonIdHash ?? 'legacy-guest',
          actorScope: 'public:assistant',
          agentRevisionId: null,
          requestKey: `legacy_as_${run.id}`,
          inputHash: createHash('sha256').update(run.question).digest('hex'),
          input: run.question,
          state: 'SUCCEEDED',
          stopReason: run.degradeReason ?? null,
          tokensIn: run.tokensIn > 0 ? run.tokensIn : null,
          tokensOut: run.tokensOut > 0 ? run.tokensOut : null,
          elapsedMs: run.elapsedMs > 0 ? run.elapsedMs : null,
          legacySource: 'AssistantRun',
          legacyId: run.id,
          createdAt: run.createdAt,
          updatedAt: run.createdAt,
        },
      });
      assistantRunsMigrated += 1;
    }

    // 回写 traceId（关联执行）
    if (!run.traceId) {
      await db.assistantRun.update({ where: { id: run.id }, data: { traceId: executionRunId } });
    }

    // 会话资源索引登记（会话历史可查）
    if (run.sessionId) {
      const resExisting = await db.conversationLogResource.findUnique({
        where: { resourceType_resourceKey: { resourceType: 'assistant-run', resourceKey: run.id } },
      });
      if (!resExisting) {
        await db.conversationLogResource.create({
          data: {
            id: input.idFactory(),
            conversationId: run.sessionId,
            resourceType: 'assistant-run',
            resourceKey: run.id,
            resourceCreatedAt: run.createdAt,
            registeredAt: run.createdAt,
          },
        });
        conversationResourcesIndexed += 1;
      }
    }
  }

  return {
    agentsTotal,
    revisionsCreated,
    agentRunsTotal,
    agentRunsMigrated,
    skillRunsTotal,
    skillRunsMigrated,
    assistantRunsTotal,
    assistantRunsMigrated,
    conversationResourcesIndexed,
    durationMs: Date.now() - startedAt,
  };
}
