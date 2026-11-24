import type { ModuleMetadata } from '@nestjs/common';
import { PrismaAdapter } from '../adapters/prisma.adapter';
import { PrismaOperationsReadRepository } from '../adapters/prisma-operations-read.repository';
import { PrismaOperationsJournal } from '../adapters/prisma-operations-journal';
import { PrismaAdminRequestLog } from '../adapters/prisma-admin-request-log';
import { InMemoryRuntimeLogBuffer, InMemoryRuntimeMetricsBuffer } from '../adapters/in-memory-runtime-buffer';
import { FsTraceRepository } from '../adapters/fs-trace.repository';
import { FsKnowledgeGraph } from '../adapters/fs-knowledge-graph';
import { FsCodeHealth } from '../adapters/fs-code-health';
import { PRISMA } from '../ports/prisma.port';
import { DATABASE } from '../database/database.port';
import { OPERATIONS_READ } from '../ports/operations-read.repository';
import { OPERATIONS_JOURNAL, OUTBOX_HANDLERS } from '../ports/operations-journal.port';
import { ADMIN_REQUEST_LOG } from '../ports/admin-request-log.port';
import { RUNTIME_LOG_BUFFER, RUNTIME_REQUEST_BUFFER } from '../ports/runtime-monitor.port';
import { TRACE_REPOSITORY, TRACE_WRITER } from '../ports/trace.repository';
import { KNOWLEDGE_GRAPH } from '../ports/knowledge-graph.port';
import { CODE_HEALTH } from '../ports/code-health.port';
import { OperationsController } from '../operations/operations.controller';
import { OperationsService } from '../operations/operations.service';
import { AdminRequestLogController } from '../operations/admin-request-log.controller';
import { RuntimeMonitorController } from '../operations/runtime-monitor.controller';
import { ActivityController } from '../operations/activity.controller';
import { ActivityService } from '../operations/activity.service';
import { OutboxDispatcher } from '../operations/outbox-dispatcher';
import { MetricsController } from '../metrics/metrics.controller';
import { MetricsService } from '../metrics/metrics.service';
import { ObservabilityController } from '../observability/observability.controller';
import { ObservabilityService } from '../observability/observability.service';
import { GraphController } from '../graph/graph.controller';
import { GraphService } from '../graph/graph.service';
import { ArchitectureController } from '../architecture/architecture.controller';
import { ArchitectureService } from '../architecture/architecture.service';
import { TraceController } from '../traces/trace.controller';
import { TraceService } from '../traces/trace.service';
import { RegisteredTraceWriter } from '../traces/registered-trace.writer';
import { LogResourceService } from '../log-resources/log-resource.service';
import { LegacyDataMigrationService } from '../migration/legacy-data-migration.service';

/** 基础设施、数据库、运营活动流、运行监控、图谱/架构健康与链路追踪 */
export const kernelCoreRegistry = {
  controllers: [
    OperationsController,
    MetricsController,
    ObservabilityController,
    AdminRequestLogController,
    RuntimeMonitorController,
    ActivityController,
    TraceController,
    GraphController,
    ArchitectureController,
  ] satisfies NonNullable<ModuleMetadata['controllers']>,
  providers: [
    /** Prisma 同时实现 DatabasePort.ping 与 PrismaPort */
    { provide: PRISMA, useClass: PrismaAdapter },
    { provide: DATABASE, useExisting: PRISMA },
    OperationsService,
    { provide: OPERATIONS_READ, useClass: PrismaOperationsReadRepository },
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
    TraceService,
    // 读与写必须是同一个实例：seq 续号状态在实例内，两个实例会各发一套 seq
    { provide: TRACE_REPOSITORY, useClass: FsTraceRepository },
    {
      provide: TRACE_WRITER,
      inject: [TRACE_REPOSITORY, LogResourceService],
      useFactory: (writer: FsTraceRepository, resources: LogResourceService) => new RegisteredTraceWriter(writer, resources),
    },
    LegacyDataMigrationService,
    { provide: CODE_HEALTH, useClass: FsCodeHealth },
    ObservabilityService,
    { provide: KNOWLEDGE_GRAPH, useClass: FsKnowledgeGraph },
    GraphService,
    ArchitectureService,
    MetricsService,
  ] satisfies NonNullable<ModuleMetadata['providers']>,
};
