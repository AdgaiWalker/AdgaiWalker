import { Inject, Injectable, Optional } from "@nestjs/common";
import type { OpsAgent, OpsCapabilities } from "@walker/shared";
import {
  AGENT_REVISION_REPOSITORY,
  type AgentRevisionRepositoryPort,
} from "../ports/agent-revision.repository";
import {
  CONTENT_FILE_REPOSITORY,
  type ContentFileRepositoryPort,
} from "../ports/content-file.repository";
import {
  AGENT_EXECUTION_REPOSITORY,
  type AgentExecutionRepositoryPort,
} from "../ports/agent-execution.repository";
import {
  OPERATIONS_READ,
  type OperationsReadPort,
} from "../ports/operations-read.repository";
import {
  DEPLOYMENT_REPOSITORY,
  type DeploymentRepositoryPort,
} from "../ports/deployment.repository";
import { CONVERSATION_QUERY_REPOSITORY, type ConversationQueryRepositoryPort } from "../ports/conversation-query.repository";
import { ApiError, storageUnavailable } from "../common/http-error";
import {
  countAnswers,
  countAsks,
  isOpsStatsWindow,
  rateOrNull,
  resolveStatsWindow,
  summarizeUsage,
  type OpsOverviewStats,
} from "@walker/shared";
import { PRISMA, type PrismaPort } from "../ports/prisma.port";
import { ContentLedgerService } from "../content-ledger/content-ledger.service";
import { CONTENT_RELEASE_REPOSITORY, type ContentReleaseRepositoryPort } from "../ports/content-release.repository";
import { CONTENT_MUTATION_SERVICE, type ContentMutationPort } from "../ports/content-mutation.port";

@Injectable()
export class OperationsService {
  constructor(
    @Inject(AGENT_REVISION_REPOSITORY)
    private readonly agentsRepository: AgentRevisionRepositoryPort,
    @Inject(CONTENT_FILE_REPOSITORY)
    private readonly content: ContentFileRepositoryPort,
    @Inject(OPERATIONS_READ) private readonly records: OperationsReadPort,
    @Inject(AGENT_EXECUTION_REPOSITORY) private readonly executions: AgentExecutionRepositoryPort,
    @Inject(DEPLOYMENT_REPOSITORY) private readonly deployments: DeploymentRepositoryPort,
    @Inject(CONVERSATION_QUERY_REPOSITORY) private readonly conversations: ConversationQueryRepositoryPort,
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Optional() @Inject(ContentLedgerService) private readonly ledger?: ContentLedgerService,
    @Optional() @Inject(CONTENT_RELEASE_REPOSITORY)
    private readonly releasesRepo?: ContentReleaseRepositoryPort,
    @Optional() @Inject(CONTENT_MUTATION_SERVICE)
    private readonly mutations?: ContentMutationPort,
  ) {}
  async capabilities(): Promise<OpsCapabilities> {
    // 真正检查读用例：SELECT 1 成功不代表所需数据表存在。
    const [agents, runs, content, execution, deployment, conversations] = await Promise.allSettled([
      Promise.resolve().then(() => this.agentsRepository.list()),
      Promise.resolve().then(() => this.records.runs({ page: 1, pageSize: 1 })),
      this.content.list(),
      Promise.resolve().then(() => this.executions.countOccupying()),
      Promise.resolve().then(() => this.deployments.list()),
      Promise.resolve().then(() => this.conversations.health()),
    ]);
    const agentsReady = agents.status === "fulfilled";
    const runsReady = runs.status === "fulfilled";
    const contentReady = content.status === "fulfilled";
    const executionReady = execution.status === "fulfilled";
    const deploymentReady = deployment.status === "fulfilled";
    const conversationsReady = conversations.status === "fulfilled";
    const db = this.prisma.getClient();
    const reminderHealth = db
      ? await Promise.allSettled([db.action.count(), db.reminderOccurrence.count()])
      : null;
    const remindersReady = Boolean(reminderHealth?.every((result) => result.status === "fulfilled"));
    const contentWriteReady = Boolean(contentReady && db && this.mutations);
    const contentPublishReady = Boolean(contentWriteReady && this.releasesRepo);
    return {
      checkedAt: new Date().toISOString(),
      database: "sqlite",
      items: [
        {
          key: "contentRead",
          state: contentReady ? "available" : "unavailable",
          reason: contentReady ? "可以浏览内容正本" : "暂时无法读取内容目录",
        },
        {
          key: "agentsRead",
          state: agentsReady ? "available" : "unavailable",
          reason: agentsReady ? "可以查看已有角色" : "角色数据暂不可用",
        },
        {
          key: "runsRead",
          state: runsReady ? "available" : "unavailable",
          reason: runsReady ? "可以回看历史执行记录" : "运行数据暂不可用",
        },
        {
          key: "agentExecute",
          state: executionReady ? "available" : "unavailable",
          reason: executionReady ? "可以提交后台试跑，结果只来自实际运行记录" : "运行记录暂不可用",
        },
        {
          key: "agentDeploy",
          state: deploymentReady ? "available" : "unavailable",
          reason: deploymentReady ? "可以管理位置草稿；启用前须通过全部就绪检查" : "位置绑定数据暂不可用",
        },
        {
          key: "conversations",
          state: conversationsReady ? "available" : "unavailable",
          reason: conversationsReady ? "可以筛选和回看保留期内的访客会话" : "访客会话记录暂不可用",
        },
        {
          key: "contentWrite",
          state: contentWriteReady ? "available" : "unavailable",
          reason: contentWriteReady ? "可在内容详情受控保存；保存不等于上线" : "内容写入或审计存储暂不可用",
        },
        {
          key: "contentPublish",
          state: contentPublishReady ? "available" : "unavailable",
          reason: contentPublishReady ? "发布入口已接通；每次仍须通过审批和范围预检" : "发布记录或内容写入暂不可用",
        },
        {
          key: "reminders",
          state: remindersReady ? "available" : "unavailable",
          reason: remindersReady ? "可在内容详情设置提醒并在提醒箱处理" : "提醒存储暂不可用",
        },
      ],
    };
  }
  /**
   * 可追溯的运营统计（O06）。
   *
   * 每条数字都在服务端算好并附口径声明（窗口/来源/缺失覆盖）：
   * - **按唯一实体计数**：提问数取唯一访客消息 id，重新生成不抬高提问数；
   * - **缺失不记 0**：无任何用量记录时返回 null，并给出覆盖率；
   * - **不造比率**：分母为 0 的比率一律 null。
   */
  async overview(input: { window?: string } = {}): Promise<OpsOverviewStats> {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    const window = isOpsStatsWindow(input.window) ? input.window : '7d';
    const now = new Date();
    const { from, to, hours } = resolveStatsWindow(window, now);
    const since = new Date(from);
    const until = new Date(to);
    const range = { gte: since, lte: until };

    // 1) 提问：唯一访客消息 / 唯一会话 / 轮次；重生成单独计（并入卡口 Clue 提问）
    const [visitorMessages, turns, attempts, clues] = await Promise.all([
      db.conversationMessage.findMany({
        where: { role: 'visitor', createdAt: range },
        select: { id: true, turnId: true, turn: { select: { conversationId: true } } },
      }),
      db.conversationTurn.findMany({ where: { createdAt: range }, select: { id: true } }),
      db.conversationAttempt.groupBy({ by: ['turnId'], where: { createdAt: range }, _count: { _all: true } }),
      db.clue.findMany({
        where: { createdAt: range },
        select: { id: true, anonId: true },
      }),
    ]);

    // 重生成只统计**窗口内轮次**的 attempt，避免把窗口外轮次算进来
    const inWindowTurnIds = new Set(turns.map((turn) => turn.id));
    const attemptCountByTurn = attempts
      .filter((row) => inWindowTurnIds.has(row.turnId))
      .map((row) => row._count._all);

    const clueMsgIds = clues.map((c) => `clue:${c.id}`);
    const clueConvIds = clues.map((c) => (c.anonId ? `anon:${c.anonId}` : `clue:${c.id}`));
    const clueTurnIds = clues.map((c) => `turn:${c.id}`);

    const asks = countAsks({
      visitorMessageIds: [...visitorMessages.map((message) => message.id), ...clueMsgIds],
      conversationIds: [...visitorMessages.map((message) => message.turn.conversationId), ...clueConvIds],
      turnIds: [...turns.map((turn) => turn.id), ...clueTurnIds],
      attemptCountByTurn,
    });

    // 2) 回答结果分层 + 交付确认（分开计数，绝不合并成"成功"）
    const [assistantMessages, runs] = await Promise.all([
      db.conversationMessage.findMany({
        where: { role: 'assistant', createdAt: range },
        select: { delivery: true },
      }),
      db.executionRun.findMany({
        where: { createdAt: range },
        select: { state: true, tokensIn: true, tokensOut: true },
      }),
    ]);
    // aiUsedFlag/degradeReason 在 AssistantRun 上：按会话轮次的 requestKey 关联不到时如实记 unknown
    const publicRuns = await db.executionRun.findMany({
      where: { createdAt: range, origin: 'public' },
      select: { id: true, state: true },
    });
    const runIds = publicRuns.map((run) => run.id);
    const assistantRuns = runIds.length
      ? await db.assistantRun.findMany({
          where: { traceId: { in: runIds } },
          select: { traceId: true, aiUsedFlag: true, degradeReason: true },
        })
      : [];
    const assistantByTrace = new Map(assistantRuns.map((run) => [run.traceId ?? '', run]));

    // 每个公开运行都出一条事实：缺 AssistantRun 关联时 aiUsedFlag 记 null → 归入 unknown，不猜成成功
    const answerRuns = publicRuns.map((run) => {
      const matched = assistantByTrace.get(run.id);
      return {
        state: run.state,
        aiUsedFlag: matched?.aiUsedFlag ?? null,
        degradeReason: matched?.degradeReason ?? null,
      };
    });
    const clueRuns = clues.map(() => ({
      state: 'SUCCEEDED',
      aiUsedFlag: true,
      degradeReason: null,
    }));
    const clueDelivery = clues.map(() => ({ delivery: 'ack' }));
    const answers = countAnswers({
      assistantMessages: [...assistantMessages, ...clueDelivery],
      runs: [...answerRuns, ...clueRuns],
    });
    const usage = summarizeUsage(runs);

    // 3) 提醒事实（复用 O01–O03 既有表，不重复造数据）
    const [openActions, dueActions, occurrences, resolvedRows] = await Promise.all([
      db.action.count({ where: { status: 'OPEN' } }),
      db.action.count({ where: { status: 'OPEN', dueAt: { not: null, lte: now } } }),
      db.reminderOccurrence.count({ where: { createdAt: range } }),
      db.reminderOccurrence.groupBy({ by: ['outcome'], where: { resolvedAt: range }, _count: { _all: true } }),
    ]);
    const resolvedMap = new Map(resolvedRows.map((row) => [row.outcome, row._count._all]));

    // 4) 内容与发布事实
    const [changes, releases, published] = await Promise.all([
      db.contentChange.count({ where: { createdAt: range } }),
      db.contentRelease.count({ where: { createdAt: range } }),
      db.contentRelease.count({ where: { createdAt: range, stage: 'PUBLISHED' } }),
    ]);

    // 5) 内容阶段分布 + 三版本状态（复用既有台账与发布仓储，不另写判定）
    const ledger = this.ledger ? await this.ledger.ledger() : null;
    const stages = { draft: 0, review: 0, ready: 0, live: 0 };
    for (const item of ledger?.items ?? []) stages[item.stage] += 1;

    // 台账已经批量汇合三套版本事实；只比较公开投影命名空间的 hash。
    const versionStates = { workingAhead: 0, indexBehind: 0, indexUnknown: 0, inSync: 0 };
    for (const item of ledger?.items ?? []) {
      const { currentPublicHash, publishedHash, indexedHash } = item.publication;
      if (!publishedHash) continue;
      const workingAhead = Boolean(currentPublicHash && currentPublicHash !== publishedHash);
      const indexBehind = Boolean(indexedHash && indexedHash !== publishedHash);
      if (workingAhead) versionStates.workingAhead += 1;
      if (indexBehind) versionStates.indexBehind += 1;
      if (!indexedHash) versionStates.indexUnknown += 1;
      if (currentPublicHash === publishedHash && indexedHash === publishedHash) versionStates.inSync += 1;
    }

    // 6) 下钻目标：每个数字都能追到同一筛选的明细
    const drilldowns: OpsOverviewStats["drilldowns"] = [
      { key: "asks", label: "访客提问", count: asks.visitorMessages, route: "records", filter: "tab=visitors" },
      { key: "overdue", label: "已到期事项", count: dueActions, route: "overview", filter: "scope=overdue" },
      { key: "openActions", label: "未完成事项", count: openActions, route: "overview", filter: "scope=open" },
      { key: "readyStage", label: "工作区有改动", count: stages.ready, route: "content", filter: "stage=ready" },
      { key: "reviewStage", label: "待审内容", count: stages.review, route: "content", filter: "stage=review" },
      ...(ledger?.publicationAvailable ? [
        { key: "workingAhead", label: "正本与线上不同", count: versionStates.workingAhead, route: "content" as const, filter: "version=working-ahead" },
        { key: "indexBehind", label: "问答索引落后", count: versionStates.indexBehind, route: "content" as const, filter: "version=index-behind" },
      ] : []),
      { key: "failedRuns", label: "失败运行", count: answers.failed, route: "records", filter: "tab=visitors&runState=FAILED" },
    ];

    return {
      provenance: {
        window,
        from,
        to,
        hours,
        sources: [
          'ConversationMessage(role=visitor) + Clue → 提问数（按消息 id 去重）',
          'ConversationTurn + ConversationAttempt + Clue → 轮次与重生成',
          'AssistantRun(traceId→ExecutionRun) + ConversationMessage.delivery + Clue → 成功/降级/交付确认/未知',
          'ExecutionRun.tokensIn/tokensOut → 用量（缺失不计 0）',
          'Action + ReminderOccurrence → 到期与处置',
          'ContentChange + ContentRelease → 内容与发布',
          '内容台账 + 最近一次已确证发布 + 激活问答快照 → 三版本状态',
        ],
        missing: [
          {
            key: 'usage',
            note: '没有任何运行记录带用量时，总量为 null（不是 0）；覆盖率说明有多少运行带用量',
            coverage: usage.coverage,
          },
          {
            key: 'answerOutcome',
            note: '缺少 AssistantRun 关联的运行如实计入 unknown，不猜成成功',
            coverage: rateOrNull(answerRuns.length - answers.unknown, answerRuns.length),
          },
          ...(!ledger?.publicationAvailable ? [{ key: 'publication', note: '发布事实暂不可读取；三版本状态待核对', coverage: null }] : []),
        ],
      },
      asks,
      answers,
      usage,
      reminders: {
        open: openActions,
        overdue: dueActions,
        occurrencesCreated: occurrences,
        resolved: {
          done: resolvedMap.get('DONE') ?? 0,
          snoozed: resolvedMap.get('SNOOZED') ?? 0,
          ignored: resolvedMap.get('IGNORED') ?? 0,
        },
      },
      content: { changes, releases, published, publicationAvailable: ledger?.publicationAvailable ?? false, stages, versionStates },
      drilldowns,
    };
  }

  async agents(): Promise<{ items: OpsAgent[]; total: number }> {
    // 直接读取仓储；不调用会自动创建默认角色的旧 list 用例。
    const items = await this.agentsRepository.list();
    return { items, total: items.length };
  }
  runs(input: { page: number; pageSize: number; agentId?: string }) {
    return this.records.runs(input);
  }
  async run(id: string) {
    const row = await this.records.run(id);
    if (!row) throw new ApiError("run-not-found", 404, "找不到这条运行记录");
    return row;
  }

  async guestQuotaStats(): Promise<{ activeGuests: number; totalExhausted: number }> {
    const db = this.prisma.getClient();
    if (!db) return { activeGuests: 0, totalExhausted: 0 };
    const now = new Date();
    const [activeGuests, all] = await Promise.all([
      db.guestQuota.count({ where: { expiresAt: { gt: now } } }),
      db.guestQuota.findMany({ select: { usedCount: true } }),
    ]);
    const quota = Number(process.env.WALKER_GUEST_INTAKE_QUOTA) || 15;
    const totalExhausted = all.filter((r) => r.usedCount >= quota).length;
    return { activeGuests, totalExhausted };
  }

  async resetAllGuestQuotas(): Promise<void> {
    const db = this.prisma.getClient();
    if (!db) return;
    await db.guestQuota.deleteMany({});
  }
}
