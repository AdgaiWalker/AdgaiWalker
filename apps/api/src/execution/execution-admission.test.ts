import { describe, expect, it, vi } from 'vitest';
import { READ_ONLY_PROFILE, type AuthorizationGrantView } from '@walker/shared';
import {
  admitQueuedExecution,
  preflightExecution,
  requiredActionsForKind,
  resolveAgentActions,
  resolveValidParentPolicy,
} from './execution-admission';
import type { AgentExecutionRecord } from '../ports/agent-execution.repository';

function sampleGrant(overrides: Partial<AuthorizationGrantView> = {}): AuthorizationGrantView {
  return {
    id: 'grant-1',
    agentId: 'agent-1',
    origin: 'admin',
    principalType: 'owner',
    principalId: 'owner',
    actions: ['agent:run', 'content:read'],
    resourceScope: { kind: 'content', ids: ['post-1'] },
    runLimit: 10,
    usageLimit: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    revokedAt: null,
    revision: 1,
    ...overrides,
  };
}

function sampleRun(overrides: Partial<AgentExecutionRecord> = {}): AgentExecutionRecord {
  const now = new Date();
  return {
    id: 'run-1',
    kind: 'chat',
    origin: 'admin',
    actor: 'owner',
    actorScope: 'admin:owner',
    agentRevisionId: 'rev-1',
    requestKey: 'req-key-1234',
    inputHash: 'hash',
    resourceScope: { kind: 'content', ids: ['post-1'] },
    input: '问题',
    deadline: new Date(now.getTime() + 60_000),
    parentRunId: null,
    grantId: 'grant-1',
    state: 'QUEUED',
    attempt: 0,
    leaseOwner: null,
    leaseEpoch: 0,
    leaseUntil: null,
    stopReason: null,
    tokensIn: null,
    tokensOut: null,
    elapsedMs: null,
    testCaseId: null,
    suiteVersion: null,
    configHash: null,
    assertion: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('execution-admission', () => {
  it('resolveAgentActions 仅认准当前只读档案版本，requiredActionsForKind 保持动作要求一致', () => {
    expect(resolveAgentActions(READ_ONLY_PROFILE)).toEqual(['agent:run', 'content:read']);
    expect(resolveAgentActions({ id: READ_ONLY_PROFILE.id, version: READ_ONLY_PROFILE.version + 1 })).toEqual([]);
    expect(resolveAgentActions(null)).toEqual([]);
    expect(requiredActionsForKind('content')).toEqual(['agent:run', 'content:read']);
    expect(requiredActionsForKind('agent')).toEqual(['agent:run']);
  });

  it('resolveValidParentPolicy 拦截已过期或非 RUNNING 的父运行', async () => {
    const now = new Date('2026-11-24T00:00:00.000Z');
    const expiredParent = sampleRun({ id: 'parent-1', state: 'RUNNING', deadline: new Date('2026-11-23T23:59:59.000Z') });
    const runs = { findById: vi.fn().mockResolvedValue(expiredParent) };
    const grant = sampleGrant();

    expect(await resolveValidParentPolicy(runs, undefined, 'owner', 'grant-1', grant, now)).toBeUndefined();
    expect(await resolveValidParentPolicy(runs, 'parent-1', 'owner', 'grant-1', grant, now)).toBeNull();
  });

  it('preflightExecution 与 admitQueuedExecution 共用同一套非只读档案拦截规则', async () => {
    const staleProfile = { id: 'read-only', version: 0 };
    const grant = sampleGrant();
    const agents = {
      detail: vi.fn().mockResolvedValue({
        id: 'agent-1',
        name: '小影',
        description: '',
        archivedAt: null,
        createdAt: '',
        revisions: [{ id: 'rev-1', version: 1, toolProfile: staleProfile }],
      }),
    };
    const grants = { find: vi.fn().mockResolvedValue(grant) };
    const runs = {
      findById: vi.fn().mockResolvedValue(null),
      locateRevision: vi.fn().mockResolvedValue({
        agentId: 'agent-1',
        archivedAt: null,
        toolProfile: staleProfile,
        prompt: '',
        providerId: null,
        modelId: 'gpt-4o-mini',
      }),
    };
    const objects = { actions: vi.fn().mockResolvedValue(['agent:run', 'content:read']) };

    await expect(preflightExecution(
      { agents: agents as never, grants: grants as never, runs, objects },
      { requestKey: 'req-key-1234', kind: 'chat', agentRevisionId: 'rev-1', targetId: 'post-1', input: 'hello' },
      { origin: 'admin', principalType: 'owner', principalId: 'owner', agentId: 'agent-1', grantId: 'grant-1' },
    )).rejects.toMatchObject({ status: 403 });

    const admitted = await admitQueuedExecution(objects, runs, sampleRun(), grant, new Date());
    expect(admitted.ok).toBe(false);
  });
});
