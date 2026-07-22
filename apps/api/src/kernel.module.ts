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
import { AdminAuthGuard } from './auth/admin-auth.guard';
import { CONTENT_FILE_REPOSITORY } from './ports/content-file.repository';
import { FsContentFileRepository } from './adapters/fs-content-file.repository';
import { ContentAdminService } from './content-admin/content-admin.service';
import { ContentAdminController } from './content-admin/content-admin.controller';
import { SUPPORT_CONFIG_REPOSITORY } from './ports/support-config.repository';
import { FsSupportConfigRepository } from './adapters/fs-support-config.repository';
import { SupportService } from './support/support.service';
import { SupportController } from './support/support.controller';

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
  ],
  providers: [
    AdminAuthGuard,
    { provide: PRISMA, useClass: PrismaAdapter },
    {
      provide: DATABASE,
      useExisting: PRISMA,
    },
    { provide: CLUE_REPOSITORY, useClass: PrismaClueRepository },
    { provide: SEED_REPOSITORY, useClass: PrismaSeedRepository },
    { provide: EXECUTION_REPOSITORY, useClass: PrismaExecutionRepository },
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
  ],
  exports: [PRISMA, DATABASE],
})
export class KernelModule {}


