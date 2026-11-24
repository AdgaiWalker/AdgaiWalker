import type { ModuleMetadata } from '@nestjs/common';
import { harnessRuntimeAdapter } from '../adapters/harness-runtime.adapter';
import { PrismaExecutionQuota } from '../adapters/prisma-execution-quota';
import { NodeProcessRegistry } from '../adapters/node-process-registry';
import { ExecutionObjectPolicy } from '../adapters/execution-object-policy';
import { PrismaAuthorizationRepository } from '../adapters/prisma-authorization.repository';
import { PrismaAgentExecutionRepository } from '../adapters/prisma-agent-execution.repository';
import { PrismaAgentRevisionRepository } from '../adapters/prisma-agent-revision.repository';
import { PrismaDeploymentRepository } from '../adapters/prisma-deployment.repository';
import { FsModelDirectory } from '../adapters/fs-model-directory';
import { FsModelCredential } from '../adapters/fs-model-credential';
import { FsPublicRouteBoundary } from '../adapters/fs-public-route-boundary';
import { EXECUTION_QUOTA } from '../ports/execution-quota.port';
import { RUNTIME_PORT } from '../ports/runtime.port';
import { PROCESS_REGISTRY } from '../ports/process-registry.port';
import { EXECUTION_OBJECT_POLICY } from '../ports/execution-object-policy.port';
import { AUTHORIZATION_REPOSITORY } from '../ports/authorization.repository';
import { AGENT_EXECUTION_REPOSITORY } from '../ports/agent-execution.repository';
import { AGENT_REVISION_REPOSITORY } from '../ports/agent-revision.repository';
import { DEPLOYMENT_REPOSITORY } from '../ports/deployment.repository';
import { MODEL_DIRECTORY, type ModelDirectoryPort } from '../ports/model-directory.port';
import { MODEL_CREDENTIAL } from '../ports/model-credential.port';
import { PUBLIC_ROUTE_BOUNDARY } from '../ports/public-route-boundary.port';
import { AgentExecutionService } from '../execution/agent-execution.service';
import { ExecutionRunsController } from '../execution/execution-runs.controller';
import { ReleaseTestController } from '../execution/release-test.controller';
import { ReleaseTestService } from '../execution/release-test.service';
import { RunRetentionController } from '../execution/run-retention.controller';
import { RunRetentionService } from '../execution/run-retention.service';
import { AuthorizationController } from '../authorization/authorization.controller';
import { AuthorizationService } from '../authorization/authorization.service';
import { AgentCatalogController } from '../agents/agent-catalog.controller';
import { AgentCatalogService } from '../agents/agent-catalog.service';
import { AgentModelConfigService } from '../agents/agent-model-config.service';
import { DeploymentController } from '../deployments/deployment.controller';
import { DeploymentService } from '../deployments/deployment.service';
import { PublicReadinessService } from '../deployments/public-readiness.service';
import { ModelConfigController } from '../model-config/model-config.controller';
import { ModelConfigService } from '../model-config/model-config.service';

/** 执行引擎、授权治理、Agent 目录、模型配置与公开部署准入 */
export const kernelExecutionRegistry = {
  controllers: [
    AuthorizationController,
    AgentCatalogController,
    ExecutionRunsController,
    ReleaseTestController,
    DeploymentController,
    ModelConfigController,
    RunRetentionController,
  ] satisfies NonNullable<ModuleMetadata['controllers']>,
  providers: [
    AgentExecutionService,
    ReleaseTestService,
    RunRetentionService,
    { provide: EXECUTION_QUOTA, useClass: PrismaExecutionQuota },
    {
      provide: RUNTIME_PORT,
      inject: [MODEL_DIRECTORY],
      useFactory: (directory: ModelDirectoryPort) => harnessRuntimeAdapter({ audience: 'admin', modelDirectory: directory }),
    },
    { provide: PROCESS_REGISTRY, useClass: NodeProcessRegistry },
    { provide: EXECUTION_OBJECT_POLICY, useClass: ExecutionObjectPolicy },
    AuthorizationService,
    { provide: AUTHORIZATION_REPOSITORY, useClass: PrismaAuthorizationRepository },
    { provide: AGENT_EXECUTION_REPOSITORY, useClass: PrismaAgentExecutionRepository },
    { provide: AGENT_REVISION_REPOSITORY, useClass: PrismaAgentRevisionRepository },
    { provide: DEPLOYMENT_REPOSITORY, useClass: PrismaDeploymentRepository },
    { provide: MODEL_DIRECTORY, useFactory: () => new FsModelDirectory() },
    { provide: MODEL_CREDENTIAL, useFactory: () => new FsModelCredential() },
    ModelConfigService,
    DeploymentService,
    AgentCatalogService,
    AgentModelConfigService,
    { provide: PUBLIC_ROUTE_BOUNDARY, useFactory: () => new FsPublicRouteBoundary() },
    PublicReadinessService,
  ] satisfies NonNullable<ModuleMetadata['providers']>,
};
