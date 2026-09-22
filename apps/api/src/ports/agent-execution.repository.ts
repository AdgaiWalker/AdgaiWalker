import type { QueueLane, RunOrigin, RunState, RunStopReason } from '@walker/shared';

export const AGENT_EXECUTION_REPOSITORY = Symbol('AGENT_EXECUTION_REPOSITORY');

export interface AgentExecutionDraft {
  id: string;
  kind: string;
  origin: RunOrigin;
  actor: string;
  actorScope: string;
  agentRevisionId: string | null;
  requestKey: string;
  inputHash: string;
  resourceScope?: import('@walker/shared').ResourceScope | null;
  input?: string | null;
  deadline: Date | null;
  parentRunId?: string | null;
  grantId?: string | null;
}

export interface AgentExecutionRecord extends AgentExecutionDraft {
  state: RunState;
  attempt: number;
  leaseOwner: string | null;
  leaseEpoch: number;
  leaseUntil: Date | null;
  stopReason: RunStopReason | null;
  input: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  elapsedMs: number | null;
  testCaseId: string | null;
  suiteVersion: number | null;
  configHash: string | null;
  assertion: { verdict: 'pass' | 'fail' | 'review'; reason: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentExecutionRepositoryPort {
  submitIfAbsent(draft: AgentExecutionDraft): Promise<{ run: AgentExecutionRecord; created: boolean }>;
  claim(id: string, owner: string, now: Date, leaseUntil: Date): Promise<AgentExecutionRecord | null>;
  renewLease(id: string, owner: string, epoch: number, now: Date, leaseUntil: Date): Promise<boolean>;
  setStateUnless(input: {
    id: string;
    from: RunState[];
    to: RunState;
    epoch: number;
    owner?: string;
    stopReason?: RunStopReason;
    tokensIn?: number | null;
    tokensOut?: number | null;
    elapsedMs?: number | null;
  }): Promise<boolean>;
  findById(id: string): Promise<AgentExecutionRecord | null>;
  findByRequest(actorScope: string, requestKey: string): Promise<AgentExecutionRecord | null>;
  list(states: RunState[], limit: number): Promise<AgentExecutionRecord[]>;
  countWaiting(lane: QueueLane, now: Date): Promise<number>;
  countOccupying(): Promise<number>;
  /** 锁住全局公平行，让同一时刻只有一个调度事务能领取。 */
  lockSchedule(): Promise<void>;
  streak(): Promise<number>;
  setStreak(value: number): Promise<void>;
  locateRevision(revisionId: string): Promise<{
    agentId: string;
    archivedAt: Date | null;
    toolProfile: { id?: string; version?: number } | null;
  } | null>;
  recordProcess(input: { runId: string; bootId: string; pid: number | null; startedAt: string | null }): Promise<void>;
  readProcess(runId: string): Promise<{ runId: string; bootId: string; pid: number | null; startedAt: string | null } | null>;
  listRecoverable(): Promise<AgentExecutionRecord[]>;
  listOwned(input: { origin: 'admin'; actor: string; agentId?: string; before: { createdAt: Date; id: string } | null; limit: number }): Promise<Array<AgentExecutionRecord & { agentId: string | null; agentName: string | null }>>;
  countOwned(agentId?: string): Promise<number>;
  markRetention(id: string, input: { retainUntil: Date; diagnosticName: string }): Promise<void>;
  listExpiredAdmin(now: Date): Promise<Array<{ id: string; diagnosticName: string | null }>>;
  deleteExpiredAdmin(id: string, now: Date): Promise<boolean>;
  markTest(id: string, input: { testCaseId: string; suiteVersion: number; configHash: string; assertion: { verdict: 'pass' | 'fail' | 'review'; reason: string } }): Promise<void>;
  listTests(revisionId: string): Promise<AgentExecutionRecord[]>;
  appendEvent(input: { runId: string; kind: 'text' | 'usage'; text?: string | null; tokensIn?: number | null; tokensOut?: number | null }): Promise<number>;
  listEvents(runId: string, after: number, limit: number): Promise<Array<{ seq: number; kind: 'text' | 'usage'; text: string | null; tokensIn: number | null; tokensOut: number | null; createdAt: Date }>>;
}
