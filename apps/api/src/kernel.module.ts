import { Module } from '@nestjs/common';
import { DATABASE } from './database/database.port';
import { ADMIN_REQUEST_LOG } from './ports/admin-request-log.port';
import { PRISMA } from './ports/prisma.port';
import { AGENT_UNIT_REPOSITORY } from './ports/agent-unit.repository';
import { AgentUnitService } from './agents/agent-unit.service';
import { AgentRunnerService } from './agents/agent-runner.service';
import { kernelCoreRegistry } from './kernel/kernel-core.registry';
import { kernelContentRegistry } from './kernel/kernel-content.registry';
import { kernelExecutionRegistry } from './kernel/kernel-execution.registry';
import { kernelAssistantRegistry } from './kernel/kernel-assistant.registry';
import { kernelWorkstationRegistry } from './kernel/kernel-workstation.registry';

@Module({
  controllers: [
    ...kernelExecutionRegistry.controllers,
    ...kernelAssistantRegistry.controllers,
    ...kernelContentRegistry.controllers,
    ...kernelCoreRegistry.controllers,
    ...kernelWorkstationRegistry.controllers,
  ],
  providers: [
    ...kernelCoreRegistry.providers,
    ...kernelContentRegistry.providers,
    ...kernelExecutionRegistry.providers,
    ...kernelAssistantRegistry.providers,
    ...kernelWorkstationRegistry.providers,
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
