import { AgentExecutionService } from './execution/agent-execution.service';
import { EXECUTION_QUOTA } from './ports/execution-quota.port';
import { PrismaExecutionQuota } from './adapters/prisma-execution-quota';
import { RUNTIME_PORT } from './ports/runtime.port';
import { harnessRuntimeAdapter } from './adapters/harness-runtime.adapter';
import { PROCESS_REGISTRY } from './ports/process-registry.port';
import { NodeProcessRegistry } from './adapters/node-process-registry';
import { EXECUTION_OBJECT_POLICY } from './ports/execution-object-policy.port';
import { ExecutionObjectPolicy } from './adapters/execution-object-policy';
import { AuthorizationController } from './authorization/authorization.controller';
import { AuthorizationService } from './authorization/authorization.service';
import { AUTHORIZATION_REPOSITORY } from './ports/authorization.repository';
import { PrismaAuthorizationRepository } from './adapters/prisma-authorization.repository';
import { OperationsController } from './operations/operations.controller';
import { ExecutionRunsController } from './execution/execution-runs.controller';
import { ReleaseTestController } from './execution/release-test.controller';
import { ReleaseTestService } from './execution/release-test.service';
import { RunRetentionController } from './execution/run-retention.controller';
import { RunRetentionService } from './execution/run-retention.service';
import { OperationsService } from './operations/operations.service';
import { OPERATIONS_READ } from './ports/operations-read.repository';
import { PrismaOperationsReadRepository } from './adapters/prisma-operations-read.repository';
import { AGENT_EXECUTION_REPOSITORY } from './ports/agent-execution.repository';
import { PrismaAgentExecutionRepository } from './adapters/prisma-agent-execution.repository';
import { OPERATIONS_JOURNAL, OUTBOX_HANDLERS } from './ports/operations-journal.port';
import { PrismaOperationsJournal } from './adapters/prisma-operations-journal';
import { OutboxDispatcher } from './operations/outbox-dispatcher';
import { AGENT_REVISION_REPOSITORY } from './ports/agent-revision.repository';
import { PrismaAgentRevisionRepository } from './adapters/prisma-agent-revision.repository';
import { AgentCatalogService } from './agents/agent-catalog.service';
import { AgentCatalogController } from './agents/agent-catalog.controller';
import { Module } from '@nestjs/common';
import { PrismaAdapter } from './adapters/prisma.adapter';
import { PrismaClueRepository } from './adapters/prisma-clue.repository';
import { PrismaSeedRepository } from './adapters/prisma-seed.repository';
import { PrismaExecutionRepository } from './adapters/prisma-execution.repository';
import { InMemoryRateLimiter } from './adapters/memory-rate-limit.adapter';
import { PrismaGuestQuotaAdapter } from './adapters/prisma-guest-quota.adapter';
import { PrismaFeatureEventAdapter } from './adapters/prisma-feature-event.adapter';
import { PRISMA } from './ports/prisma.port';
import { CLUE_REPOSITORY } from './ports/clue.repository';
import { SEED_REPOSITORY } from './ports/seed.repository';
import { EXECUTION_REPOSITORY } from './ports/execution.repository';
import { ACTION_REPOSITORY } from './ports/action.repository';
import { PrismaActionRepository } from './adapters/prisma-action.repository';
import { RATE_LIMIT } from './ports/rate-limit.port';
import { GUEST_QUOTA } from './ports/guest-quota.port';
import { NEXT_STEP_STRATEGY } from './ports/nextstep.port';
import { FEATURE_EVENT } from './ports/feature-event.port';
import { DATABASE } from './database/database.port';
import { IntakeService } from './intake/intake.service';
import { IntakeController } from './intake/intake.controller';
import { ClueService } from './clue/clue.service';
import { ClueController } from './clue/clue.controller';
import { SeedService } from './seed/seed.service';
import { SeedController } from './seed/seed.controller';
import { ExecutionService } from './execution/execution.service';
import { ExecutionController } from './execution/execution.controller';
import { MetricsService } from './metrics/metrics.service';
import { MetricsController } from './metrics/metrics.controller';
import { HealthService } from './health/health.service';
import { LIKE_REPOSITORY } from './ports/like.repository';
import { PrismaLikeRepository } from './adapters/prisma-like.repository';
import { LikeService } from './engagement/like.service';
import { LikeController } from './engagement/like.controller';
import { ContentFeedbackService } from './engagement/content-feedback.service';
import { ContentFeedbackController } from './engagement/content-feedback.controller';
import { SearchEventsController } from './engagement/search-events.controller';
import { SearchEventsService } from './engagement/search-events.service';
import { CONTENT_FILE_REPOSITORY } from './ports/content-file.repository';
import { FsContentFileRepository } from './adapters/fs-content-file.repository';
import { ContentAdminService } from './content-admin/content-admin.service';
import { ContentAdminController } from './content-admin/content-admin.controller';
import { SUPPORT_CONFIG_REPOSITORY } from './ports/support-config.repository';
import { FsSupportConfigRepository } from './adapters/fs-support-config.repository';
import { SupportService } from './support/support.service';
import { SupportController } from './support/support.controller';
import { WorkController } from './work/work.controller';
import { WorkService } from './work/work.service';
import { WORK_REPOSITORY } from './ports/work.repository';
import { PrismaWorkRepository } from './adapters/prisma-work.repository';
import { ARTIFACT_REPOSITORY } from './ports/artifact.repository';
import { FsArtifactRepository } from './adapters/fs-artifact.repository';
import { APP_CONFIG, type AppConfigPort } from './config/config.port';
import { SITE_CONTENT_INDEX } from './ports/site-content-index.port';
import { FsSiteContentIndex } from './adapters/fs-site-content-index';
import { AiNextStepAdapter } from './adapters/ai-nextstep.adapter';
import { ASSISTANT_RUNNER } from './ports/assistant-runner.port';
import { ASSISTANT_REPOSITORY } from './ports/assistant.repository';
import { PrismaAssistantRepository } from './adapters/prisma-assistant.repository';
import { RuleAssistantAdapter } from './adapters/rule-assistant.adapter';
import { HarnessAssistantAdapter } from './adapters/harness-assistant.adapter';
import { AssistantService } from './assistant/assistant.service';
import { InsightsService } from './insights/insights.service';
import { InsightsController } from './insights/insights.controller';
import { AssistantController } from './assistant/assistant.controller';
import { WorkbenchService } from './workbench/workbench.service';
import { WorkbenchController } from './workbench/workbench.controller';
import { ProductionService } from './workflow/production.service';
import { ProductionController } from './workflow/production.controller';
import { AGENT_RUNNER, type AgentRunnerPort } from './ports/agent-runner.port';
import type { SiteContentIndexPort } from './ports/site-content-index.port';
import { DshAgentRunner } from './adapters/dsh-agent.runner';
import { STAGE_ARTIFACT_REPOSITORY } from './ports/stage-artifact.repository';
import { FsStageArtifactRepository } from './adapters/fs-stage-artifact.repository';
import { ReviewService } from './workflow/review.service';
import { ReviewController } from './workflow/review.controller';
import { PublicationService } from './workflow/publication.service';
import { PublicationController } from './workflow/publication.controller';
import { PUBLICATION_REPOSITORY } from './ports/publication.repository';
import { PrismaPublicationRepository } from './adapters/prisma-publication.repository';
import { PUBLICATION_PACKAGE_REPOSITORY } from './ports/publication-package.repository';
import { FsPublicationPackageRepository } from './adapters/fs-publication-package.repository';
import { ActionService } from './action/action.service';
import { ActionController } from './action/action.controller';
import { PlanService } from './plan/plan.service';
import { PlanController } from './plan/plan.controller';
import { WORK_EXPORT_SERVICE, WorkExportService } from './workflow/export.service';
import { ExportController } from './workflow/export.controller';
import { WEBSITE_DEPLOYMENT_VERIFIER } from './ports/website-deployment-verifier.port';
import { HttpWebsiteDeploymentVerifier } from './adapters/http-website-deployment-verifier';
import { WECHAT_DRAFT_SESSION } from './ports/wechat-draft-session.port';
import { UnavailableWechatDraftSession } from './adapters/unavailable-wechat-draft-session';
import { MODEL_PROVIDER_REPOSITORY } from './ports/model-provider.repository';
import { PrismaModelProviderRepository } from './adapters/prisma-model-provider.repository';
import { LLM_CLIENT } from './ports/llm.port';
import { OpenAiCompatibleLlm } from './adapters/openai-compatible-llm.adapter';
import path from 'node:path';
import { SKILL_CATALOG } from './ports/skill.port';
import { FsSkillCatalog } from './adapters/fs-skill.catalog';

/** 技能包根目录：仓库根 `skills/`，可用 WALKER_SKILLS_DIR 覆盖 */
function resolveSkillsRoot(): string {
  const fromEnv = process.env.WALKER_SKILLS_DIR?.trim();
  return fromEnv ? path.resolve(fromEnv) : path.resolve(process.cwd(), '../..', 'skills');
}
import { SkillService } from './skills/skill.service';
import { SkillController } from './skills/skill.controller';
import { AGENT_UNIT_REPOSITORY } from './ports/agent-unit.repository';
import { PrismaAgentUnitRepository } from './adapters/prisma-agent-unit.repository';
import { ModelProviderService } from './model-providers/model-provider.service';
import { ModelProviderController } from './model-providers/model-provider.controller';
import { AgentUnitService } from './agents/agent-unit.service';
import { AgentUnitController } from './agents/agent-unit.controller';
import { AgentRunnerService } from './agents/agent-runner.service';
import { ObservabilityService } from './observability/observability.service';
import { ObservabilityController } from './observability/observability.controller';
import { KNOWLEDGE_GRAPH } from './ports/knowledge-graph.port';
import { FsKnowledgeGraph } from './adapters/fs-knowledge-graph';
import { GraphService } from './graph/graph.service';
import { GraphController } from './graph/graph.controller';
import { CODE_HEALTH } from './ports/code-health.port';
import { FsCodeHealth } from './adapters/fs-code-health';
import { ArchitectureService } from './architecture/architecture.service';
import { ArchitectureController } from './architecture/architecture.controller';
import { TRACE_REPOSITORY, TRACE_WRITER } from './ports/trace.repository';
import { FsTraceRepository } from './adapters/fs-trace.repository';
import { TraceService } from './traces/trace.service';
import { TraceController } from './traces/trace.controller';
import { CONTENT_LEDGER_REPOSITORY } from './ports/content-ledger.repository';
import { GIT_STATUS } from './ports/git-status.repository';
import { FsContentLedgerRepository } from './adapters/fs-content-ledger.repository';
import { NodeGitStatusRepository } from './adapters/node-git-status.repository';
import { ContentLedgerService } from './content-ledger/content-ledger.service';
import { ContentLedgerController } from './content-ledger/content-ledger.controller';
import { CONTENT_RELEASE_RUNNER } from './ports/content-release-runner.port';
import { PnpmContentReleaseRunner } from './adapters/pnpm-content-release.runner';
import { ContentReleaseService } from './content-release/content-release.service';
import { ContentReleaseController } from './content-release/content-release.controller';

/** Prisma 同时实现 DatabasePort.ping 与 PrismaPort */
@Module({
  controllers: [
    AuthorizationController,
    AgentCatalogController,
    OperationsController,
    ExecutionRunsController,
    ReleaseTestController,
    RunRetentionController,
    SkillController,
    IntakeController,
    AssistantController,
    InsightsController,
    ClueController,
    SeedController,
    ExecutionController,
    MetricsController,
    ObservabilityController,
    LikeController,
    ContentFeedbackController,
    SearchEventsController,
    // 路由顺序约束：ledger 必须在 ContentAdminController 之前注册 ——
    // 后者已有 @Get(':slug')（content-admin.controller.ts:27-30），注册在前会把 'ledger' 当 slug 吃掉
    ContentLedgerController,
    ContentAdminController,
    ContentReleaseController,
    TraceController,
    SupportController,
    ActionController,
    PlanController,
    WorkController,
    WorkbenchController,
    ProductionController,
    ReviewController,
    PublicationController,
    ExportController,
    ModelProviderController,
    AgentUnitController,
    GraphController,
    ArchitectureController,
  ],
  providers: [
    AgentExecutionService,
    ReleaseTestService,
    RunRetentionService,
    { provide: EXECUTION_QUOTA, useClass: PrismaExecutionQuota },
    { provide: RUNTIME_PORT, useFactory: () => harnessRuntimeAdapter({ audience: 'admin' }) },
    { provide: PROCESS_REGISTRY, useClass: NodeProcessRegistry },
    { provide: EXECUTION_OBJECT_POLICY, useClass: ExecutionObjectPolicy },
    AuthorizationService,
    { provide: AUTHORIZATION_REPOSITORY, useClass: PrismaAuthorizationRepository },
    OperationsService,
    { provide: OPERATIONS_READ, useClass: PrismaOperationsReadRepository },
    { provide: AGENT_EXECUTION_REPOSITORY, useClass: PrismaAgentExecutionRepository },
    { provide: OPERATIONS_JOURNAL, useClass: PrismaOperationsJournal },
    { provide: OUTBOX_HANDLERS, useValue: {} },
    OutboxDispatcher,
    { provide: AGENT_REVISION_REPOSITORY, useClass: PrismaAgentRevisionRepository },
    AgentCatalogService,
    { provide: PRISMA, useClass: PrismaAdapter },
    {
      provide: DATABASE,
      useExisting: PRISMA,
    },
    { provide: CLUE_REPOSITORY, useClass: PrismaClueRepository },
    { provide: SEED_REPOSITORY, useClass: PrismaSeedRepository },
    { provide: EXECUTION_REPOSITORY, useClass: PrismaExecutionRepository },
    { provide: ACTION_REPOSITORY, useClass: PrismaActionRepository },
    { provide: LIKE_REPOSITORY, useClass: PrismaLikeRepository },
    { provide: CONTENT_FILE_REPOSITORY, useClass: FsContentFileRepository },
    { provide: CONTENT_LEDGER_REPOSITORY, useClass: FsContentLedgerRepository },
    { provide: GIT_STATUS, useClass: NodeGitStatusRepository },
    TraceService,
    // 读与写必须是同一个实例：seq 续号状态在实例内，两个实例会各发一套 seq
    { provide: TRACE_REPOSITORY, useClass: FsTraceRepository },
    { provide: TRACE_WRITER, useExisting: TRACE_REPOSITORY },
    ContentLedgerService,
    ContentReleaseService,
    { provide: CONTENT_RELEASE_RUNNER, useClass: PnpmContentReleaseRunner },
    {
      provide: SUPPORT_CONFIG_REPOSITORY,
      useClass: FsSupportConfigRepository,
    },
    { provide: RATE_LIMIT, useClass: InMemoryRateLimiter },
    { provide: GUEST_QUOTA, useClass: PrismaGuestQuotaAdapter },
    { provide: SITE_CONTENT_INDEX, useClass: FsSiteContentIndex },
    { provide: KNOWLEDGE_GRAPH, useClass: FsKnowledgeGraph },
    { provide: CODE_HEALTH, useClass: FsCodeHealth },
    { provide: ASSISTANT_REPOSITORY, useClass: PrismaAssistantRepository },
    ObservabilityService,
    GraphService,
    ArchitectureService,
    { provide: RuleAssistantAdapter, useClass: RuleAssistantAdapter },
    {
      // 助手双实现：harness AI 内嵌规则兜底（AI 可关/超时/坏输出全降级）；
      // 每日预算熔断在 AssistantService 前置，触顶直接路由到规则版
      provide: ASSISTANT_RUNNER,
      inject: [APP_CONFIG, SITE_CONTENT_INDEX, RuleAssistantAdapter],
      useFactory: (
        config: AppConfigPort,
        index: SiteContentIndexPort,
        rule: RuleAssistantAdapter,
      ) => new HarnessAssistantAdapter(config, index, rule),
    },
    AssistantService,
    InsightsService,
    {
      // AI 策略内嵌规则兜底：AI_ENABLED≠true 或 runner 失败时行为与规则版一致
      provide: NEXT_STEP_STRATEGY,
      inject: [APP_CONFIG, AGENT_RUNNER, SITE_CONTENT_INDEX],
      useFactory:
        (config: AppConfigPort, runner: AgentRunnerPort, index: SiteContentIndexPort) =>
          new AiNextStepAdapter(config, runner, index),
    },
    { provide: FEATURE_EVENT, useClass: PrismaFeatureEventAdapter },
    IntakeService,
    ClueService,
    SeedService,
    ExecutionService,
    MetricsService,
    LikeService,
    ContentFeedbackService,
    SearchEventsService,
    ContentAdminService,
    SupportService,
    ActionService,
    PlanService,
    WorkService,
    WorkbenchService,
    ProductionService,
    ReviewService,
    PublicationService,
    {
      provide: WORK_EXPORT_SERVICE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfigPort) => new WorkExportService(config.getWorkRootDir()),
    },
    { provide: PUBLICATION_REPOSITORY, useClass: PrismaPublicationRepository },
    { provide: WEBSITE_DEPLOYMENT_VERIFIER, useClass: HttpWebsiteDeploymentVerifier },
    { provide: WECHAT_DRAFT_SESSION, useClass: UnavailableWechatDraftSession },
    {
      provide: PUBLICATION_PACKAGE_REPOSITORY,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfigPort) => new FsPublicationPackageRepository(config.getWorkRootDir()),
    },
    // AGENT_RUNTER 统一走 dsh（2026-09-06 定案）：卡口 nextStep + 工作站配方共用，
    // 与助手/洞察同一运行时家族；站主面无规则兜底，失败如实抛错
    {
      provide: AGENT_RUNNER,
      inject: [APP_CONFIG],
      useFactory: (config: import('./config/config.port').AppConfigPort) =>
        new DshAgentRunner(config),
    },
    {
      provide: STAGE_ARTIFACT_REPOSITORY,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfigPort) => new FsStageArtifactRepository(config.getWorkRootDir()),
    },
    { provide: WORK_REPOSITORY, useClass: PrismaWorkRepository },
    {
      provide: ARTIFACT_REPOSITORY,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfigPort) => new FsArtifactRepository(config.getWorkRootDir()),
    },
    { provide: MODEL_PROVIDER_REPOSITORY, useClass: PrismaModelProviderRepository },
    { provide: AGENT_UNIT_REPOSITORY, useClass: PrismaAgentUnitRepository },
    ModelProviderService,
    {
      // 技能执行的唯一模型出口：OpenAI 兼容直连。
      // 换引擎（harness / 其他 SDK）只需换这个 provide，上层（runner）不动。
      provide: LLM_CLIENT,
      useClass: OpenAiCompatibleLlm,
    },
    {
      // 技能真身在文件系统：`skills/<id>/`（仓库根），可用 WALKER_SKILLS_DIR 覆盖。
      // 不注入 DB：技能是资产，DB 只是索引与运行数据。
      provide: SKILL_CATALOG,
      useFactory: () => new FsSkillCatalog(resolveSkillsRoot()),
    },
    SkillService,
    AgentUnitService,
    AgentRunnerService,
  ],
  exports: [
    PRISMA,
    DATABASE,
    MODEL_PROVIDER_REPOSITORY,
    AGENT_UNIT_REPOSITORY,
    ModelProviderService,
    AgentUnitService,
    AgentRunnerService,
  ],
})
export class KernelModule {}
