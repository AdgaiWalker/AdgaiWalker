import type { ModuleMetadata } from '@nestjs/common';
import { FsContentFileRepository } from '../adapters/fs-content-file.repository';
import { FsCandidateFileRepository } from '../adapters/fs-candidate-file.repository';
import { FsContentLedgerRepository } from '../adapters/fs-content-ledger.repository';
import { FsContentLock } from '../adapters/fs-content-lock';
import { FsArticleVersionStore } from '../adapters/fs-article-version-store';
import { FsPublicSnapshotRepository } from '../adapters/fs-public-snapshot.repository';
import { NodeGitStatusRepository } from '../adapters/node-git-status.repository';
import { GitPlumbingContentReleaseRunner } from '../adapters/git-plumbing-content-release.runner';
import { HttpWebsiteDeploymentVerifier } from '../adapters/http-website-deployment-verifier';
import { PrismaContentChangeRepository } from '../adapters/prisma-content-change.repository';
import { PrismaContentReleaseRepository } from '../adapters/prisma-content-release.repository';
import { PrismaReminderOccurrenceRepository } from '../adapters/prisma-reminder.repository';
import { PrismaReviewEntryRepository } from '../adapters/prisma-review-entry.repository';
import { PrismaReminderDispositionRepository } from '../adapters/prisma-reminder-disposition.repository';
import { PrismaConversationActionCommit } from '../adapters/prisma-conversation-action-commit';
import { CONTENT_FILE_REPOSITORY } from '../ports/content-file.repository';
import { CANDIDATE_FILE_REPOSITORY } from '../ports/candidate-file.repository';
import { CONTENT_LEDGER_REPOSITORY } from '../ports/content-ledger.repository';
import { GIT_STATUS } from '../ports/git-status.repository';
import { CONTENT_LOCK } from '../ports/content-lock.port';
import { CONTENT_CHANGE_REPOSITORY } from '../ports/content-change.repository';
import { CONTENT_RELEASE_REPOSITORY } from '../ports/content-release.repository';
import { CONTENT_RELEASE_RUNNER } from '../ports/content-release-runner.port';
import { ARTICLE_VERSION_STORE } from '../ports/article-version-store.port';
import { CONTENT_MUTATION_SERVICE } from '../ports/content-mutation.port';
import { WEBSITE_DEPLOYMENT_VERIFIER } from '../ports/website-deployment-verifier.port';
import { PUBLIC_SNAPSHOT_REPOSITORY } from '../ports/public-snapshot.repository';
import { REMINDER_OCCURRENCE_REPOSITORY } from '../ports/reminder.repository';
import { REVIEW_ENTRY_REPOSITORY } from '../ports/review-entry.repository';
import { REMINDER_DISPOSITION } from '../ports/reminder-disposition.port';
import { CONVERSATION_ACTION_COMMIT } from '../ports/conversation-action-commit.port';
import { ContentLedgerController } from '../content-ledger/content-ledger.controller';
import { ContentLedgerService } from '../content-ledger/content-ledger.service';
import { ContentSyncController, GithubWebhookController } from '../content-sync/content-sync.controller';
import { ContentSyncService } from '../content-sync/content-sync.service';
import { ContentAdminController } from '../content-admin/content-admin.controller';
import { ContentAdminService } from '../content-admin/content-admin.service';
import { ContentChangeController } from '../content-mutation/content-change.controller';
import { ContentMutationService } from '../content-mutation/content-mutation.service';
import { ContentReleaseController } from '../content-release/content-release.controller';
import { ContentReleaseService } from '../content-release/content-release.service';
import { ReminderController } from '../reminder/reminder.controller';
import { ReminderService } from '../reminder/reminder.service';
import { ReminderScanService } from '../reminder/reminder-scan.service';
import { ConversationActionService } from '../reminder/conversation-action.service';

/** 内容工作台、双端同步、原子发布、版本演进、变更审核与提醒复盘 */
export const kernelContentRegistry = {
  controllers: [
    // 路由顺序约束：ledger 与 sync 必须在 ContentAdminController 之前注册 ——
    // 后者已有 @Get(':slug')（content-admin.controller.ts），注册在前会把 'ledger'/'sync' 当 slug 吃掉
    ContentLedgerController,
    ContentSyncController,
    GithubWebhookController,
    ContentAdminController,
    ContentChangeController,
    ContentReleaseController,
    ReminderController,
  ] satisfies NonNullable<ModuleMetadata['controllers']>,
  providers: [
    ContentSyncService,
    { provide: CONVERSATION_ACTION_COMMIT, useClass: PrismaConversationActionCommit },
    { provide: CONTENT_FILE_REPOSITORY, useClass: FsContentFileRepository },
    { provide: CONTENT_LEDGER_REPOSITORY, useClass: FsContentLedgerRepository },
    { provide: GIT_STATUS, useClass: NodeGitStatusRepository },
    { provide: CONTENT_LOCK, useFactory: () => new FsContentLock() },
    { provide: CANDIDATE_FILE_REPOSITORY, useFactory: () => new FsCandidateFileRepository() },
    { provide: CONTENT_CHANGE_REPOSITORY, useClass: PrismaContentChangeRepository },
    { provide: CONTENT_RELEASE_REPOSITORY, useClass: PrismaContentReleaseRepository },
    { provide: ARTICLE_VERSION_STORE, useClass: FsArticleVersionStore },
    { provide: REMINDER_OCCURRENCE_REPOSITORY, useClass: PrismaReminderOccurrenceRepository },
    { provide: REVIEW_ENTRY_REPOSITORY, useClass: PrismaReviewEntryRepository },
    { provide: REMINDER_DISPOSITION, useClass: PrismaReminderDispositionRepository },
    { provide: CONTENT_MUTATION_SERVICE, useClass: ContentMutationService },
    ContentLedgerService,
    ContentReleaseService,
    ReminderService,
    ReminderScanService,
    ConversationActionService,
    { provide: CONTENT_RELEASE_RUNNER, useClass: GitPlumbingContentReleaseRunner },
    ContentAdminService,
    { provide: WEBSITE_DEPLOYMENT_VERIFIER, useClass: HttpWebsiteDeploymentVerifier },
    { provide: PUBLIC_SNAPSHOT_REPOSITORY, useFactory: () => new FsPublicSnapshotRepository() },
  ] satisfies NonNullable<ModuleMetadata['providers']>,
};
