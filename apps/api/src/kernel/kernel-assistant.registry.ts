import path from 'node:path';
import type { ModuleMetadata } from '@nestjs/common';
import { PrismaConversationRepository } from '../adapters/prisma-conversation.repository';
import { FsAssistantEventSpool } from '../adapters/fs-assistant-event-spool';
import { InMemoryRateLimiter } from '../adapters/memory-rate-limit.adapter';
import { PrismaGuestQuotaAdapter } from '../adapters/prisma-guest-quota.adapter';
import { PrismaFeatureEventAdapter } from '../adapters/prisma-feature-event.adapter';
import { PrismaLikeRepository } from '../adapters/prisma-like.repository';
import { FsSiteContentIndex } from '../adapters/fs-site-content-index';
import { PrismaAssistantRepository } from '../adapters/prisma-assistant.repository';
import { RuleAssistantAdapter } from '../adapters/rule-assistant.adapter';
import { HarnessAssistantAdapter } from '../adapters/harness-assistant.adapter';
import { PrismaLogResourceRepository } from '../adapters/prisma-log-resource.repository';
import { FsLogResourceCleaner } from '../adapters/fs-log-resource.cleaner';
import { PrismaConversationDeletionRepository } from '../adapters/prisma-conversation-deletion.repository';
import { FsDeletionManifestStore } from '../adapters/fs-deletion-manifest.store';
import { PrismaConversationQueryRepository } from '../adapters/prisma-conversation-query.repository';
import { PrismaConversationExportRepository } from '../adapters/prisma-conversation-export.repository';
import { FsConversationExportFileStore } from '../adapters/fs-conversation-export-file-store';
import { APP_CONFIG, type AppConfigPort } from '../config/config.port';
import { CONVERSATION_REPOSITORY } from '../ports/conversation.repository';
import { ASSISTANT_EVENT_SPOOL } from '../ports/assistant-event-spool.port';
import { ASSISTANT_EVENT_RECORDER } from '../ports/assistant-event-recorder.port';
import { RATE_LIMIT } from '../ports/rate-limit.port';
import { GUEST_QUOTA } from '../ports/guest-quota.port';
import { FEATURE_EVENT } from '../ports/feature-event.port';
import { LIKE_REPOSITORY } from '../ports/like.repository';
import { SITE_CONTENT_INDEX, type SiteContentIndexPort } from '../ports/site-content-index.port';
import { ASSISTANT_REPOSITORY } from '../ports/assistant.repository';
import { ASSISTANT_RUNNER, RULE_ASSISTANT } from '../ports/assistant-runner.port';
import { LOG_RESOURCE_REPOSITORY } from '../ports/log-resource.repository';
import { LOG_RESOURCE_CLEANER } from '../ports/log-resource-cleaner.port';
import { CONVERSATION_DELETION_REPOSITORY } from '../ports/conversation-deletion.repository';
import { DELETION_MANIFEST } from '../ports/deletion-manifest.port';
import { CONVERSATION_QUERY_REPOSITORY } from '../ports/conversation-query.repository';
import { CONVERSATION_EXPORT_REPOSITORY } from '../ports/conversation-export.repository';
import { CONVERSATION_EXPORT_FILE_STORE } from '../ports/conversation-export-file-store.port';
import { CONVERSATION_EXPORT_REVOKER } from '../ports/conversation-export-revoker.port';
import { AssistantEventRecorder } from '../assistant/assistant-event-recorder.service';
import { AssistantController } from '../assistant/assistant.controller';
import { AssistantService } from '../assistant/assistant.service';
import { PublicAssistantService } from '../assistant/public-assistant.service';
import { JevFastPathService } from '../assistant/jev-fast-path.service';
import { InsightsController } from '../insights/insights.controller';
import { InsightsService } from '../insights/insights.service';
import { IntakeController } from '../intake/intake.controller';
import { IntakeService } from '../intake/intake.service';
import { LikeController } from '../engagement/like.controller';
import { LikeService } from '../engagement/like.service';
import { ContentFeedbackController } from '../engagement/content-feedback.controller';
import { ContentFeedbackService } from '../engagement/content-feedback.service';
import { SearchEventsController } from '../engagement/search-events.controller';
import { SearchEventsService } from '../engagement/search-events.service';
import { LogResourceController } from '../log-resources/log-resource.controller';
import { LogResourceService } from '../log-resources/log-resource.service';
import { ConversationDeletionController } from '../log-resources/conversation-deletion.controller';
import { ConversationDeletionService } from '../log-resources/conversation-deletion.service';
import { DeletionManifestReplayService } from '../log-resources/deletion-manifest-replay.service';
import { LogRetentionCleanupService } from '../log-resources/log-retention-cleanup.service';
import { ConversationQueryController } from '../log-resources/conversation-query.controller';
import { ConversationQueryService } from '../log-resources/conversation-query.service';
import { ConversationExportController } from '../log-resources/conversation-export.controller';
import { ConversationExportService } from '../log-resources/conversation-export.service';

/** 访客问答、对话归档/导出/删除、日志资源治理、互动与问答洞察 */
export const kernelAssistantRegistry = {
  controllers: [
    IntakeController,
    AssistantController,
    InsightsController,
    LogResourceController,
    ConversationDeletionController,
    ConversationQueryController,
    ConversationExportController,
    LikeController,
    ContentFeedbackController,
    SearchEventsController,
  ] satisfies NonNullable<ModuleMetadata['controllers']>,
  providers: [
    { provide: CONVERSATION_REPOSITORY, useClass: PrismaConversationRepository },
    {
      provide: ASSISTANT_EVENT_SPOOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfigPort) => new FsAssistantEventSpool(config.getDatabaseUrl()),
    },
    AssistantEventRecorder,
    { provide: ASSISTANT_EVENT_RECORDER, useExisting: AssistantEventRecorder },
    { provide: LIKE_REPOSITORY, useClass: PrismaLikeRepository },
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
    { provide: CONVERSATION_EXPORT_REPOSITORY, useClass: PrismaConversationExportRepository },
    {
      provide: CONVERSATION_EXPORT_FILE_STORE,
      useFactory: () => new FsConversationExportFileStore(process.env.WALKER_EXPORT_DIR?.trim() || path.resolve('data/exports')),
    },
    ConversationExportService,
    { provide: CONVERSATION_EXPORT_REVOKER, useExisting: ConversationExportService },
    { provide: RATE_LIMIT, useClass: InMemoryRateLimiter },
    { provide: GUEST_QUOTA, useClass: PrismaGuestQuotaAdapter },
    { provide: SITE_CONTENT_INDEX, useClass: FsSiteContentIndex },
    { provide: ASSISTANT_REPOSITORY, useClass: PrismaAssistantRepository },
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
    { provide: FEATURE_EVENT, useClass: PrismaFeatureEventAdapter },
    IntakeService,
    LikeService,
    ContentFeedbackService,
    SearchEventsService,
  ] satisfies NonNullable<ModuleMetadata['providers']>,
};
