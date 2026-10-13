import 'reflect-metadata';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EnvConfigAdapter } from './config/env-config.adapter';
import { loadApiEnvFile } from './config/load-api-env';
import { installRuntimeMonitoring } from './observability/runtime-monitoring';
import { AgentExecutionService } from './execution/agent-execution.service';
import { RunRetentionService } from './execution/run-retention.service';
import { ConversationDeletionService } from './log-resources/conversation-deletion.service';
import { DeletionManifestReplayService } from './log-resources/deletion-manifest-replay.service';
import { LogRetentionCleanupService } from './log-resources/log-retention-cleanup.service';
import { ReminderScanService } from './reminder/reminder-scan.service';
import { ConversationExportService } from './log-resources/conversation-export.service';
import { resolveDeletionManifestPath } from './adapters/fs-deletion-manifest.store';
import { isRestoreGatePending, resolveRestoreGatePath, restoreGateMiddleware } from './runtime/restore-gate';

async function bootstrap() {
  loadApiEnvFile();
  const config = new EnvConfigAdapter();
  if (config.getNodeEnv() === 'production' && !process.env.WALKER_ADMIN_TOKEN?.trim()) {
    throw new Error(
      'WALKER_ADMIN_TOKEN is required in production (admin routes have no other credential)',
    );
  }
  const restoreGateFile = resolveRestoreGatePath();
  if (config.getNodeEnv() === 'production' && !restoreGateFile) {
    throw new Error('WALKER_RESTORE_GATE_FILE is required in production');
  }
  const manifestFile = resolveDeletionManifestPath();
  const restoring = isRestoreGatePending(restoreGateFile);
  if (restoring && !fsSync.existsSync(manifestFile)) {
    throw new Error('deletion-manifest-required-for-restore');
  }

  process.env.WALKER_STARTUP_RECONCILIATION = '1';
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    app.use(restoreGateMiddleware(restoreGateFile));
    // 本地开发运行监控：Nest Logger 的终端输出照旧，同时留一份可查的进程内副本；
    // 同一次请求既打终端，也进环形缓冲供后台查询。fail-open，与后台日志 fail-closed 相反。
    installRuntimeMonitoring(app);
    app.enableShutdownHooks();

    const manifestReplay = app.get(DeletionManifestReplayService);
    await manifestReplay.replay({ force: restoring });
    await app.init();
    await app.get(ConversationDeletionService).resumePending();
    const runsDir = process.env.WALKER_RUNS_DIR?.trim() || path.resolve('data/runs');
    await app.get(RunRetentionService).cleanup(runsDir);
    await app.get(LogRetentionCleanupService).cleanupExpired();
    const conversationExports = app.get(ConversationExportService);
    await conversationExports.prepareForStartup();
    await conversationExports.resumePending();
    if (restoring) await manifestReplay.assertManifestCompleted();

    if (restoring && restoreGateFile) await fs.rm(restoreGateFile);
    process.env.WALKER_STARTUP_RECONCILIATION = '0';
    // 启动补检：重启期间到期的提醒不等下一个 5 分钟；随后起定时器（每 5 分钟一轮）
    const reminderScan = app.get(ReminderScanService);
    await reminderScan.scanOnce();
    await reminderScan.startScheduler();
    await app.get(AgentExecutionService).startScheduler();
    const host = config.getHost();
    const port = config.getPort();
    await app.listen(port, host);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level: 'info', msg: 'api_started', host, port, aiEnabled: config.isAiEnabled() }));
  } catch (error) {
    await app.close().catch(() => {});
    throw error;
  }
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'api_boot_failed',
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
