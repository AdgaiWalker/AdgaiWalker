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
import { AdminRequestLogController } from './operations/admin-request-log.controller';
import { RuntimeMonitorController } from './operations/runtime-monitor.controller';
import { ActivityController } from './operations/activity.controller';
import { ActivityService } from './operations/activity.service';
import { RUNTIME_LOG_BUFFER, RUNTIME_REQUEST_BUFFER } from './ports/runtime-monitor.port';
import {
  InMemoryRuntimeLogBuffer,
  InMemoryRuntimeMetricsBuffer,
} from './adapters/in-memory-runtime-buffer';
import { ADMIN_REQUEST_LOG } from './ports/admin-request-log.port';
import { PrismaAdminRequestLog } from './adapters/prisma-admin-request-log';
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
import { DEPLOYMENT_REPOSITORY } from './ports/deployment.repository';
import { PrismaDeploymentRepository } from './adapters/prisma-deployment.repository';
import { CONVERSATION_REPOSITORY } from './ports/conversation.repository';
import { PrismaConversationRepository } from './adapters/prisma-conversation.repository';
import { ASSISTANT_EVENT_SPOOL } from './ports/assistant-event-spool.port';
import { FsAssistantEventSpool } from './adapters/fs-assistant-event-spool';
import { ASSISTANT_EVENT_RECORDER } from './ports/assistant-event-recorder.port';
import { AssistantEventRecorder } from './assistant/assistant-event-recorder.service';
import { MODEL_DIRECTORY, type ModelDirectoryPort } from './ports/model-directory.port';
import { FsModelDirectory } from './adapters/fs-model-directory';
import { MODEL_CREDENTIAL } from './ports/model-credential.port';
import { FsModelCredential } from './adapters/fs-model-credential';
import { ModelConfigService } from './model-config/model-config.service';
import { ModelConfigController } from './model-config/model-config.controller';
import { DeploymentService } from './deployments/deployment.service';
import { DeploymentController } from './deployments/deployment.controller';
import { AgentCatalogService } from './agents/agent-catalog.service';
import { AgentModelConfigService } from './agents/agent-model-config.service';
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
import { CONVERSATION_ACTION_COMMIT } from './ports/conversation-action-commit.port';
import { PrismaConversationActionCommit } from './adapters/prisma-conversation-action-commit';
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
import { CANDIDATE_FILE_REPOSITORY } from './ports/candidate-file.repository';
import { FsCandidateFileRepository } from './adapters/fs-candidate-file.repository';
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
import { ASSISTANT_RUNNER, RULE_ASSISTANT } from './ports/assistant-runner.port';
import { ASSISTANT_REPOSITORY } from './ports/assistant.repository';
import { PrismaAssistantRepository } from './adapters/prisma-assistant.repository';
import { RuleAssistantAdapter } from './adapters/rule-assistant.adapter';
import { HarnessAssistantAdapter } from './adapters/harness-assistant.adapter';
import { AssistantService } from './assistant/assistant.service';
import { PublicAssistantService } from './assistant/public-assistant.service';
import { JevFastPathService } from './assistant/jev-fast-path.service';
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
import { PUBLIC_SNAPSHOT_REPOSITORY } from './ports/public-snapshot.repository';
import { FsPublicSnapshotRepository } from './adapters/fs-public-snapshot.repository';
import { WECHAT_DRAFT_SESSION } from './ports/wechat-draft-session.port';
import { UnavailableWechatDraftSession } from './adapters/unavailable-wechat-draft-session';

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
import { RegisteredTraceWriter } from './traces/registered-trace.writer';
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
import { ContentChangeController } from './content-mutation/content-change.controller';
import { LOG_RESOURCE_REPOSITORY } from './ports/log-resource.repository';
import { PrismaLogResourceRepository } from './adapters/prisma-log-resource.repository';
import { LogResourceService } from './log-resources/log-resource.service';
import { LogResourceController } from './log-resources/log-resource.controller';
import { LOG_RESOURCE_CLEANER } from './ports/log-resource-cleaner.port';
import { FsLogResourceCleaner } from './adapters/fs-log-resource.cleaner';
import { CONVERSATION_DELETION_REPOSITORY } from './ports/conversation-deletion.repository';
import { PrismaConversationDeletionRepository } from './adapters/prisma-conversation-deletion.repository';
import { ConversationDeletionService } from './log-resources/conversation-deletion.service';
import { ConversationDeletionController } from './log-resources/conversation-deletion.controller';
import { DELETION_MANIFEST } from './ports/deletion-manifest.port';
import { FsDeletionManifestStore } from './adapters/fs-deletion-manifest.store';
import { DeletionManifestReplayService } from './log-resources/deletion-manifest-replay.service';
import { LogRetentionCleanupService } from './log-resources/log-retention-cleanup.service';
import { ConversationQueryController } from './log-resources/conversation-query.controller';
import { ConversationQueryService } from './log-resources/conversation-query.service';
import { CONVERSATION_QUERY_REPOSITORY } from './ports/conversation-query.repository';
import { PrismaConversationQueryRepository } from './adapters/prisma-conversation-query.repository';
import { ConversationExportController } from './log-resources/conversation-export.controller';
import { ConversationExportService } from './log-resources/conversation-export.service';
import { CONVERSATION_EXPORT_REPOSITORY } from './ports/conversation-export.repository';
import { PrismaConversationExportRepository } from './adapters/prisma-conversation-export.repository';
import { CONTENT_CHANGE_REPOSITORY } from './ports/content-change.repository';
import { PrismaContentChangeRepository } from './adapters/prisma-content-change.repository';
import { CONTENT_RELEASE_REPOSITORY } from './ports/content-release.repository';
import { PrismaContentReleaseRepository } from './adapters/prisma-content-release.repository';
import { FsArticleVersionStore } from './adapters/fs-article-version-store';
import { ARTICLE_VERSION_STORE } from './ports/article-version-store.port';
import { CONTENT_MUTATION_SERVICE } from './ports/content-mutation.port';
import { ContentMutationService } from './content-mutation/content-mutation.service';
import { CONVERSATION_EXPORT_FILE_STORE } from './ports/conversation-export-file-store.port';
import { FsConversationExportFileStore } from './adapters/fs-conversation-export-file-store';
import { CONVERSATION_EXPORT_REVOKER } from './ports/conversation-export-revoker.port';
import { PUBLIC_ROUTE_BOUNDARY } from './ports/public-route-boundary.port';
import { FsPublicRouteBoundary } from './adapters/fs-public-route-boundary';
import { PublicReadinessService } from './deployments/public-readiness.service';
import { CONTENT_LOCK } from './ports/content-lock.port';
import { FsContentLock } from './adapters/fs-content-lock';
import { REMINDER_OCCURRENCE_REPOSITORY } from './ports/reminder.repository';
import { PrismaReminderOccurrenceRepository } from './adapters/prisma-reminder.repository';
import { REVIEW_ENTRY_REPOSITORY } from './ports/review-entry.repository';
import { PrismaReviewEntryRepository } from './adapters/prisma-review-entry.repository';
import { ReminderService } from './reminder/reminder.service';
import { ReminderScanService } from './reminder/reminder-scan.service';
import { ConversationActionService } from './reminder/conversation-action.service';
import { LegacyDataMigrationService } from './migration/legacy-data-migration.service';
import { REMINDER_DISPOSITION } from './ports/reminder-disposition.port';
import { PrismaReminderDispositionRepository } from './adapters/prisma-reminder-disposition.repository';
import { ReminderController } from './reminder/reminder.controller';

/** Prisma 同时实现 DatabasePort.ping 与 PrismaPort */
@Module({
  controllers: [
    AuthorizationController,
    AgentCatalogController,
    OperationsController,
    ExecutionRunsController,
    ReleaseTestController,
    DeploymentController,
    ModelConfigController,
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
    LogResourceController,
    ConversationDeletionController,
    ConversationQueryController,
    ConversationExportController,
    LikeController,
    ContentFeedbackController,
    SearchEventsController,
    // 路由顺序约束：ledger 必须在 ContentAdminController 之前注册 ——
    // 后者已有 @Get(':slug')（content-admin.controller.ts:27-30），注册在前会把 'ledger' 当 slug 吃掉
    ContentLedgerController,
    ContentAdminController,
    ContentChangeController,
    ContentReleaseController,
    ReminderController,
    AdminRequestLogController,
    RuntimeMonitorController,
    ActivityController,
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
    AgentUnitController,
    GraphController,
    ArchitectureController,
  ],
  providers: [
    AgentExecutionService,
    ReleaseTestService,
    RunRetentionService,
    { provide: EXECUTION_QUOTA, useClass: PrismaExecutionQuota },
    { provide: RUNTIME_PORT, inject: [MODEL_DIRECTORY], useFactory: (directory: ModelDirectoryPort) => harnessRuntimeAdapter({ audience: 'admin', modelDirectory: directory }) },
    { provide: PROCESS_REGISTRY, useClass: NodeProcessRegistry },
    { provide: EXECUTION_OBJECT_POLICY, useClass: ExecutionObjectPolicy },
    AuthorizationService,
    { provide: AUTHORIZATION_REPOSITORY, useClass: PrismaAuthorizationRepository },
    OperationsService,
    { provide: OPERATIONS_READ, useClass: PrismaOperationsReadRepository },
    { provide: AGENT_EXECUTION_REPOSITORY, useClass: PrismaAgentExecutionRepository },
    { provide: OPERATIONS_JOURNAL, useClass: PrismaOperationsJournal },
    { provide: ADMIN_REQUEST_LOG, useClass: PrismaAdminRequestLog },
    // 进程内运行监控缓冲：采集侧（main.ts 的 tee logger、请求中间件）与查询侧
    // （RuntimeMonitorController）必须拿到同一个实例，所以只能在这里单点接线。
    { provide: RUNTIME_LOG_BUFFER, useClass: InMemoryRuntimeLogBuffer },
    { provide: RUNTIME_REQUEST_BUFFER, useClass: InMemoryRuntimeMetricsBuffer },
    // 活动流是纯读取时聚合（run/对话/提醒/复盘/后台日志的投影），无自身存储
    ActivityService,
    { provide: OUTBOX_HANDLERS, useValue: {} },
    OutboxDispatcher,
    { provide: AGENT_REVISION_REPOSITORY, useClass: PrismaAgentRevisionRepository },
    { provide: DEPLOYMENT_REPOSITORY, useClass: PrismaDeploymentRepository },
    { provide: CONVERSATION_REPOSITORY, useClass: PrismaConversationRepository },
    {
      provide: ASSISTANT_EVENT_SPOOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfigPort) => new FsAssistantEventSpool(config.getDatabaseUrl()),
    },
    AssistantEventRecorder,
    { provide: ASSISTANT_EVENT_RECORDER, useExisting: AssistantEventRecorder },
    { provide: MODEL_DIRECTORY, useFactory: () => new FsModelDirectory() },
    { provide: MODEL_CREDENTIAL, useFactory: () => new FsModelCredential() },
    ModelConfigService,
    DeploymentService,
    AgentCatalogService,
    AgentModelConfigService,
    { provide: PRISMA, useClass: PrismaAdapter },
    {
      provide: DATABASE,
      useExisting: PRISMA,
    },
    { provide: CLUE_REPOSITORY, useClass: PrismaClueRepository },
    { provide: SEED_REPOSITORY, useClass: PrismaSeedRepository },
    { provide: EXECUTION_REPOSITORY, useClass: PrismaExecutionRepository },
    { provide: ACTION_REPOSITORY, useClass: PrismaActionRepository },
    { provide: CONVERSATION_ACTION_COMMIT, useClass: PrismaConversationActionCommit },
    { provide: LIKE_REPOSITORY, useClass: PrismaLikeRepository },
    { provide: CONTENT_FILE_REPOSITORY, useClass: FsContentFileRepository },
    { provide: CONTENT_LEDGER_REPOSITORY, useClass: FsContentLedgerRepository },
    { provide: GIT_STATUS, useClass: NodeGitStatusRepository },
    TraceService,
    // 读与写必须是同一个实例：seq 续号状态在实例内，两个实例会各发一套 seq
    { provide: TRACE_REPOSITORY, useClass: FsTraceRepository },
    {
      provide: TRACE_WRITER,
      inject: [TRACE_REPOSITORY, LogResourceService],
      useFactory: (writer: FsTraceRepository, resources: LogResourceService) => new RegisteredTraceWriter(writer, resources),
    },
    { provide: LOG_RESOURCE_REPOSITORY, useClass: PrismaLogResourceRepository },
    { provide: LOG_RESOURCE_CLEANER, useClass: FsLogResourceCleaner },
    { provide: CONVERSATION_DELETION_REPOSITORY, useClass: PrismaConversationDeletionRepository },
    { provide: DELETION_MANIFEST, useFactory: () => new FsDeletionManifestStore() },
    LogResourceService,
    ConversationDeletionService,
    DeletionManifestReplayService,
    LogRetentionCleanupService,
    { provide: CONVERSATION_QUERY_REPOSITORY, useClass: PrismaConversationQueryRepository },
    ConversationQueryService,
    { provide: PUBLIC_ROUTE_BOUNDARY, useFactory: () => new FsPublicRouteBoundary() },
    PublicReadinessService,
    { provide: CONVERSATION_EXPORT_REPOSITORY, useClass: PrismaConversationExportRepository },
    { provide: CONTENT_LOCK, useFactory: () => new FsContentLock() },
    { provide: CANDIDATE_FILE_REPOSITORY, useFactory: () => new FsCandidateFileRepository() },
    { provide: CONTENT_CHANGE_REPOSITORY, useClass: PrismaContentChangeRepository },
    { provide: CONTENT_RELEASE_REPOSITORY, useClass: PrismaContentReleaseRepository },
    { provide: ARTICLE_VERSION_STORE, useClass: FsArticleVersionStore },
    { provide: REMINDER_OCCURRENCE_REPOSITORY, useClass: PrismaReminderOccurrenceRepository },
    { provide: REVIEW_ENTRY_REPOSITORY, useClass: PrismaReviewEntryRepository },
    { provide: REMINDER_DISPOSITION, useClass: PrismaReminderDispositionRepository },
    { provide: CONTENT_MUTATION_SERVICE, useClass: ContentMutationService },
    {
      provide: CONVERSATION_EXPORT_FILE_STORE,
      useFactory: () => new FsConversationExportFileStore(process.env.WALKER_EXPORT_DIR?.trim() || path.resolve('data/exports')),
    },
    ConversationExportService,
    { provide: CONVERSATION_EXPORT_REVOKER, useExisting: ConversationExportService },
    ContentLedgerService,
    ContentReleaseService,
    ReminderService,
    ReminderScanService,
    ConversationActionService,
    LegacyDataMigrationService,
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
    { provide: RULE_ASSISTANT, useExisting: RuleAssistantAdapter },
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
    PublicAssistantService,
    JevFastPathService,
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
    { provide: PUBLIC_SNAPSHOT_REPOSITORY, useFactory: () => new FsPublicSnapshotRepository() },
    { provide: WECHAT_DRAFT_SESSION, useClass: UnavailableWechatDraftSession },
    {
      provide: PUBLICATION_PACKAGE_REPOSITORY,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfigPort) => new FsPublicationPackageRepository(config.getWorkRootDir()),
    },
    // AGENT_RUNNER 统一走 dsh（2026-09-06 定案）：卡口 nextStep + 工作站配方共用，
    // 与助手/洞察同一运行时家族；站主面无规则兜底，失败如实抛错
    {
      provide: AGENT_RUNNER,
      inject: [APP_CONFIG, MODEL_DIRECTORY],
      useFactory: (config: AppConfigPort, directory: ModelDirectoryPort) =>
        new DshAgentRunner(config, null, directory),
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
    { provide: AGENT_UNIT_REPOSITORY, useClass: PrismaAgentUnitRepository },
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
    ADMIN_REQUEST_LOG,
    PRISMA,
    DATABASE,
    AGENT_UNIT_REPOSITORY,
    AgentUnitService,
    AgentRunnerService,
  ],
})
export class KernelModule {}
