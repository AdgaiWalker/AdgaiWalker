import path from 'node:path';
import type { ModuleMetadata } from '@nestjs/common';
import { PrismaClueRepository } from '../adapters/prisma-clue.repository';
import { PrismaSeedRepository } from '../adapters/prisma-seed.repository';
import { PrismaExecutionRepository } from '../adapters/prisma-execution.repository';
import { PrismaActionRepository } from '../adapters/prisma-action.repository';
import { FsSupportConfigRepository } from '../adapters/fs-support-config.repository';
import { FsArtifactRepository } from '../adapters/fs-artifact.repository';
import { PrismaWorkRepository } from '../adapters/prisma-work.repository';
import { AiNextStepAdapter } from '../adapters/ai-nextstep.adapter';
import { DshAgentRunner } from '../adapters/dsh-agent.runner';
import { FsStageArtifactRepository } from '../adapters/fs-stage-artifact.repository';
import { PrismaPublicationRepository } from '../adapters/prisma-publication.repository';
import { FsPublicationPackageRepository } from '../adapters/fs-publication-package.repository';
import { UnavailableWechatDraftSession } from '../adapters/unavailable-wechat-draft-session';
import { PrismaAgentUnitRepository } from '../adapters/prisma-agent-unit.repository';
import { OpenAiCompatibleLlm } from '../adapters/openai-compatible-llm.adapter';
import { FsSkillCatalog } from '../adapters/fs-skill.catalog';
import { APP_CONFIG, type AppConfigPort } from '../config/config.port';
import { CLUE_REPOSITORY } from '../ports/clue.repository';
import { SEED_REPOSITORY } from '../ports/seed.repository';
import { EXECUTION_REPOSITORY } from '../ports/execution.repository';
import { ACTION_REPOSITORY } from '../ports/action.repository';
import { SUPPORT_CONFIG_REPOSITORY } from '../ports/support-config.repository';
import { WORK_REPOSITORY } from '../ports/work.repository';
import { ARTIFACT_REPOSITORY } from '../ports/artifact.repository';
import { NEXT_STEP_STRATEGY } from '../ports/nextstep.port';
import { SITE_CONTENT_INDEX, type SiteContentIndexPort } from '../ports/site-content-index.port';
import { AGENT_RUNNER, type AgentRunnerPort } from '../ports/agent-runner.port';
import { MODEL_DIRECTORY, type ModelDirectoryPort } from '../ports/model-directory.port';
import { STAGE_ARTIFACT_REPOSITORY } from '../ports/stage-artifact.repository';
import { PUBLICATION_REPOSITORY } from '../ports/publication.repository';
import { PUBLICATION_PACKAGE_REPOSITORY } from '../ports/publication-package.repository';
import { WECHAT_DRAFT_SESSION } from '../ports/wechat-draft-session.port';
import { AGENT_UNIT_REPOSITORY } from '../ports/agent-unit.repository';
import { LLM_CLIENT } from '../ports/llm.port';
import { SKILL_CATALOG } from '../ports/skill.port';
import { ClueController } from '../clue/clue.controller';
import { ClueService } from '../clue/clue.service';
import { SeedController } from '../seed/seed.controller';
import { SeedService } from '../seed/seed.service';
import { ExecutionController } from '../execution/execution.controller';
import { ExecutionService } from '../execution/execution.service';
import { SupportController } from '../support/support.controller';
import { SupportService } from '../support/support.service';
import { ActionController } from '../action/action.controller';
import { ActionService } from '../action/action.service';
import { PlanController } from '../plan/plan.controller';
import { PlanService } from '../plan/plan.service';
import { WorkController } from '../work/work.controller';
import { WorkService } from '../work/work.service';
import { WorkbenchController } from '../workbench/workbench.controller';
import { WorkbenchService } from '../workbench/workbench.service';
import { ProductionController } from '../workflow/production.controller';
import { ProductionService } from '../workflow/production.service';
import { ReviewController } from '../workflow/review.controller';
import { ReviewService } from '../workflow/review.service';
import { PublicationController } from '../workflow/publication.controller';
import { PublicationService } from '../workflow/publication.service';
import { ExportController } from '../workflow/export.controller';
import { WORK_EXPORT_SERVICE, WorkExportService } from '../workflow/export.service';
import { SkillController } from '../skills/skill.controller';
import { SkillService } from '../skills/skill.service';
import { AgentUnitController } from '../agents/agent-unit.controller';
import { AgentUnitService } from '../agents/agent-unit.service';
import { AgentRunnerService } from '../agents/agent-runner.service';

/** 技能包根目录：仓库根 `skills/`，可用 WALKER_SKILLS_DIR 覆盖 */
function resolveSkillsRoot(): string {
  const fromEnv = process.env.WALKER_SKILLS_DIR?.trim();
  return fromEnv ? path.resolve(fromEnv) : path.resolve(process.cwd(), '../..', 'skills');
}

/** 线索、题苗、计划/行动、工作站流水线、技能资产与 AgentUnit 运行出口 */
export const kernelWorkstationRegistry = {
  controllers: [
    SkillController,
    ClueController,
    SeedController,
    ExecutionController,
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
  ] satisfies NonNullable<ModuleMetadata['controllers']>,
  providers: [
    { provide: CLUE_REPOSITORY, useClass: PrismaClueRepository },
    { provide: SEED_REPOSITORY, useClass: PrismaSeedRepository },
    { provide: EXECUTION_REPOSITORY, useClass: PrismaExecutionRepository },
    { provide: ACTION_REPOSITORY, useClass: PrismaActionRepository },
    { provide: SUPPORT_CONFIG_REPOSITORY, useClass: FsSupportConfigRepository },
    {
      // AI 策略内嵌规则兜底：AI_ENABLED≠true 或 runner 失败时行为与规则版一致
      provide: NEXT_STEP_STRATEGY,
      inject: [APP_CONFIG, AGENT_RUNNER, SITE_CONTENT_INDEX],
      useFactory: (config: AppConfigPort, runner: AgentRunnerPort, index: SiteContentIndexPort) =>
        new AiNextStepAdapter(config, runner, index),
    },
    ClueService,
    SeedService,
    ExecutionService,
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
      useFactory: (config: AppConfigPort, directory: ModelDirectoryPort) => new DshAgentRunner(config, null, directory),
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
  ] satisfies NonNullable<ModuleMetadata['providers']>,
};
