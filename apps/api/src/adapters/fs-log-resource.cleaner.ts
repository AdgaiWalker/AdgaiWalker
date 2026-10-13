import fs from 'node:fs/promises';
import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { agentHomeDir } from '@walker/shared';
import { storageUnavailable } from '../common/http-error';
import { resolveModelHomeDir } from '../runtime/dsh-home-paths';
import { dshSessionDirectory } from '../runtime/dsh-session-resource-path';
import type { LogResourceCleanerPort } from '../ports/log-resource-cleaner.port';
import { ASSISTANT_EVENT_SPOOL, type AssistantEventSpoolPort } from '../ports/assistant-event-spool.port';
import type { LogResourceRecord } from '../ports/log-resource.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { TRACE_REPOSITORY, type TraceRepositoryPort } from '../ports/trace.repository';
import { CONVERSATION_EXPORT_REVOKER, type ConversationExportRevokerPort } from '../ports/conversation-export-revoker.port';

@Injectable()
export class FsLogResourceCleaner implements LogResourceCleanerPort {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(ASSISTANT_EVENT_SPOOL) private readonly spool: AssistantEventSpoolPort,
    @Inject(TRACE_REPOSITORY) private readonly traces: TraceRepositoryPort,
    @Inject(CONVERSATION_EXPORT_REVOKER) private readonly exports: ConversationExportRevokerPort,
  ) {}

  async remove(resource: LogResourceRecord): Promise<void> {
    switch (resource.resourceType) {
      case 'assistant-event-spool':
        await this.spool.remove([resource.resourceKey]);
        return;
      case 'trace':
        await this.traces.deleteTraceFile(resource.resourceKey);
        return;
      case 'native-session':
      case 'native-fork':
        await this.removeNativeSession(resource.resourceKey, resource.agentRevisionId);
        return;
      case 'export':
        if (!resource.parentKey) throw new Error('export-resource-job-missing');
        await this.exports.revokeAndRemove(resource.parentKey);
        return;
      default:
        throw new Error('log-resource-file-cleanup-not-supported');
    }
  }

  private async removeNativeSession(sessionId: string, agentRevisionId: string | null): Promise<void> {
    if (!agentRevisionId) throw new Error('native-session-revision-missing');
    const client = this.prisma.getClient();
    if (!client) throw storageUnavailable();
    const revision = await client.agentRevision.findUnique({ where: { id: agentRevisionId }, select: { agentId: true } });
    if (!revision) throw new Error('native-session-revision-not-found');
    const agentHome = agentHomeDir(resolveModelHomeDir(), revision.agentId);
    const sessionRoot = path.join(agentHome, 'sessions');
    const materialsDir = path.join(agentHome, 'materials');
    const target = dshSessionDirectory(agentHome, materialsDir, sessionId);
    await removeDirectoryWithinRoot(sessionRoot, target);
  }
}

async function removeDirectoryWithinRoot(root: string, target: string): Promise<void> {
  const absoluteRoot = path.resolve(root);
  const absoluteTarget = path.resolve(target);
  const relative = path.relative(absoluteRoot, absoluteTarget);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('resource-path-outside-root');
  }

  const rootStat = await lstatIfPresent(absoluteRoot);
  if (!rootStat) return;
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('resource-root-not-directory');

  let current = absoluteRoot;
  const parts = relative.split(path.sep);
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const entry = await lstatIfPresent(current);
    if (!entry) return;
    if (entry.isSymbolicLink()) throw new Error('resource-path-symlink');
    if (index < parts.length - 1 && !entry.isDirectory()) throw new Error('resource-path-not-directory');
  }
  await fs.rm(absoluteTarget, { recursive: true, force: true });
}

async function lstatIfPresent(target: string) {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    ((error as { code?: string }).code === 'ENOENT' || (error as { code?: string }).code === 'ENOTDIR');
}
