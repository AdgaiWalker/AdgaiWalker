import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaPort } from '../ports/prisma.port';
import type { AssistantEventSpoolPort } from '../ports/assistant-event-spool.port';
import type { TraceRepositoryPort } from '../ports/trace.repository';
import { dshSessionDirectory } from '../runtime/dsh-session-resource-path';
import { FsLogResourceCleaner } from './fs-log-resource.cleaner';

const roots: string[] = [];

async function tempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-log-cleaner-'));
  roots.push(root);
  vi.stubEnv('WALKER_MODEL_HOME', root);
  return root;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

function makeCleaner() {
  const prisma = {
    getClient: () => ({ agentRevision: { findUnique: vi.fn(async () => ({ agentId: 'agent-1' })) } }),
  } as unknown as PrismaPort;
  const spool = { remove: vi.fn(async () => {}) } as unknown as AssistantEventSpoolPort;
  const trace = { deleteTraceFile: vi.fn(async () => {}) } as unknown as TraceRepositoryPort;
  const exports = { revokeAndRemove: vi.fn(async () => {}) };
  return { cleaner: new FsLogResourceCleaner(prisma, spool, trace, exports), spool, trace, exports };
}

describe('FsLogResourceCleaner', () => {
  it('removes only the session-owned directory derived from the Agent home and session ID', async () => {
    const root = await tempRoot();
    const home = path.join(root, 'agents', 'agent-1');
    const target = dshSessionDirectory(home, path.join(home, 'materials'), 'session-a');
    const sibling = dshSessionDirectory(home, path.join(home, 'materials'), 'session-b');
    await fs.mkdir(target, { recursive: true });
    await fs.mkdir(sibling, { recursive: true });
    await fs.writeFile(path.join(target, 'session.jsonl.zstd'), 'body copy');
    await fs.writeFile(path.join(sibling, 'session.jsonl.zstd'), 'other conversation');
    const { cleaner } = makeCleaner();

    await cleaner.remove({
      id: 'native-resource', conversationId: 'conversation-1', resourceType: 'native-session',
      resourceKey: 'session-a', agentRevisionId: 'revision-1', parentKey: null, resourceCreatedAt: new Date(), registeredAt: new Date(),
    });

    await expect(fs.stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(path.join(sibling, 'session.jsonl.zstd'))).resolves.toBeTruthy();
  });

  it('refuses to follow a symlink out of the controlled DSH session root', async () => {
    const root = await tempRoot();
    const home = path.join(root, 'agents', 'agent-1');
    const outside = path.join(root, 'outside');
    await fs.mkdir(outside, { recursive: true });
    await fs.writeFile(path.join(outside, 'session.jsonl.zstd'), 'other data');
    const project = dshSessionDirectory(home, path.join(home, 'materials'), 'session-a');
    const projectRoot = path.dirname(project);
    await fs.mkdir(path.dirname(projectRoot), { recursive: true });
    await fs.symlink(outside, projectRoot, process.platform === 'win32' ? 'junction' : 'dir');
    const { cleaner } = makeCleaner();

    await expect(cleaner.remove({
      id: 'native-resource', conversationId: 'conversation-1', resourceType: 'native-session',
      resourceKey: 'session-a', agentRevisionId: 'revision-1', parentKey: null, resourceCreatedAt: new Date(), registeredAt: new Date(),
    })).rejects.toThrow('resource-path-symlink');
    await expect(fs.stat(path.join(outside, 'session.jsonl.zstd'))).resolves.toBeTruthy();
  });

  it('revokes the whole parent export job when cleaning a conversation-owned export resource', async () => {
    const { cleaner, exports } = makeCleaner();
    await cleaner.remove({
      id: 'export-resource', conversationId: 'conversation-1', resourceType: 'export',
      resourceKey: 'job/conversation-1', agentRevisionId: null, parentKey: 'job',
      resourceCreatedAt: new Date(), registeredAt: new Date(),
    });

    expect(exports.revokeAndRemove).toHaveBeenCalledWith('job');
  });
});
