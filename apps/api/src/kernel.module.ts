import { Module } from '@nestjs/common';
import { PrismaAdapter } from './adapters/prisma.adapter';
import { PrismaClueRepository } from './adapters/prisma-clue.repository';
import { PrismaSeedRepository } from './adapters/prisma-seed.repository';
import { PrismaExecutionRepository } from './adapters/prisma-execution.repository';
import { InMemoryRateLimiter } from './adapters/memory-rate-limit.adapter';
import { PrismaGuestQuotaAdapter } from './adapters/prisma-guest-quota.adapter';
import { RuleNextStepAdapter } from './adapters/rule-nextstep.adapter';
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
import { WorkbenchService } from './workbench/workbench.service';
import { WorkbenchController } from './workbench/workbench.controller';
import { ProductionService } from './workflow/production.service';
import { ProductionController } from './workflow/production.controller';
import { AGENT_RUNNER } from './ports/agent-runner.port';
import { CodexAgentRunner } from './adapters/codex-agent.runner';
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
import { WORK_EXPORT_SERVICE, WorkExportService } from './workflow/export.service';
import { ExportController } from './workflow/export.controller';
import { WEBSITE_DEPLOYMENT_VERIFIER } from './ports/website-deployment-verifier.port';
import { HttpWebsiteDeploymentVerifier } from './adapters/http-website-deployment-verifier';

/** Prisma 同时实现 DatabasePort.ping 与 PrismaPort */
@Module({
  controllers: [
    IntakeController,
    ClueController,
    SeedController,
    ExecutionController,
    MetricsController,
    LikeController,
    ContentFeedbackController,
    SearchEventsController,
    ContentAdminController,
    SupportController,
    ActionController,
    WorkController,
    WorkbenchController,
    ProductionController,
    ReviewController,
    PublicationController,
    ExportController,
  ],
  providers: [
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
    {
      provide: SUPPORT_CONFIG_REPOSITORY,
      useClass: FsSupportConfigRepository,
    },
    { provide: RATE_LIMIT, useClass: InMemoryRateLimiter },
    { provide: GUEST_QUOTA, useClass: PrismaGuestQuotaAdapter },
    { provide: NEXT_STEP_STRATEGY, useClass: RuleNextStepAdapter },
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
    {
      provide: PUBLICATION_PACKAGE_REPOSITORY,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfigPort) => new FsPublicationPackageRepository(config.getWorkRootDir()),
    },
    { provide: AGENT_RUNNER, useClass: CodexAgentRunner },
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
  ],
  exports: [PRISMA, DATABASE],
})
export class KernelModule {}


