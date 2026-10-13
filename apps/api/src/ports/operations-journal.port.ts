import type { AgentExecutionRepositoryPort } from './agent-execution.repository';

export const OPERATIONS_JOURNAL = Symbol('OPERATIONS_JOURNAL');
export const OUTBOX_HANDLERS = Symbol('OUTBOX_HANDLERS');

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  outcome: string;
  beforeHash?: string | null;
  afterHash?: string | null;
  requestId?: string | null;
}
export interface OutboxEvent {
  id: string;
  eventKey: string;
  topic: string;
  aggregateId: string;
  payloadRef: string | null;
  attempt: number;
  nextAt: Date;
  deliveredAt: Date | null;
  deadAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}
export type OutboxDraft = Pick<OutboxEvent, 'id' | 'eventKey' | 'topic' | 'aggregateId' | 'payloadRef'>;

/** 仅供本地数据库事务使用；消费者不得执行网络、文件或模型调用。 */
export interface OperationsTransaction {
  client: object;
  runs: AgentExecutionRepositoryPort;
  grants: import('./authorization.repository').AuthorizationRepositoryPort;
  releases: import('./content-release.repository').ContentReleaseRepositoryPort;
  appendAudit(entry: AuditEntry): Promise<void>;
  enqueue(event: OutboxDraft): Promise<void>;
  claimOutbox(id: string, attempt: number, now: Date): Promise<OutboxEvent | null>;
  deliverOutbox(id: string, attempt: number, now: Date): Promise<void>;
  ensureDeletionTombstone(id: string, conversationId: string): Promise<{
    tombstone: import('./log-resource.repository').DeletionTombstoneRecord;
    created: boolean;
  }>;
}
export interface OperationsJournalPort {
  transaction<T>(work: (transaction: OperationsTransaction) => Promise<T>): Promise<T>;
  pending(now: Date, limit: number): Promise<OutboxEvent[]>;
  fail(event: OutboxEvent, now: Date, errorCode: string): Promise<void>;
  deadLetters(limit: number): Promise<OutboxEvent[]>;
  auditTrail(targetType: string, targetId: string, limit: number): Promise<AuditEntry[]>;
}
export type OutboxHandlers = Readonly<Record<string, (event: OutboxEvent, transaction: OperationsTransaction) => Promise<void>>>;
