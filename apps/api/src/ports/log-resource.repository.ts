export const LOG_RESOURCE_REPOSITORY = Symbol('LOG_RESOURCE_REPOSITORY');

export const LOG_RESOURCE_TYPES = [
  'message',
  'event',
  'assistant-run',
  'execution-run',
  'execution-event',
  'native-session',
  'native-fork',
  'trace',
  'assistant-event-spool',
  'export',
  'daily-aggregate',
] as const;

export type LogResourceType = (typeof LOG_RESOURCE_TYPES)[number];

export type LogResourceInput = {
  conversationId: string | null;
  resourceType: LogResourceType;
  resourceKey: string;
  agentRevisionId?: string | null;
  parentKey?: string | null;
  resourceCreatedAt?: Date;
  /** Runtime session materialized by a turn already being stopped. */
  allowDuringDeletion?: boolean;
};

export type LogResourceRecord = {
  id: string;
  conversationId: string | null;
  resourceType: string;
  resourceKey: string;
  agentRevisionId: string | null;
  parentKey: string | null;
  resourceCreatedAt: Date;
  registeredAt: Date;
};

export type LogRetentionPolicy = {
  detailRetentionDays: number;
  aggregateRetentionDays: number;
  updatedAt: Date;
};

export type DeletionTombstoneState = 'pending' | 'stopping' | 'deleting' | 'blocked' | 'completed';

export type DeletionTombstoneRecord = {
  id: string;
  conversationId: string;
  state: string;
  attempts: number;
  lastErrorCode: string | null;
  requestedAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

export interface LogResourceRepositoryPort {
  register(input: LogResourceInput): Promise<void>;
  find(resourceType: LogResourceType, resourceKey: string): Promise<LogResourceRecord | null>;
  forConversation(conversationId: string): Promise<LogResourceRecord[]>;
  expired(input: { detailBefore: Date; aggregateBefore: Date; limit: number }): Promise<LogResourceRecord[]>;
  getPolicy(): Promise<LogRetentionPolicy>;
  updatePolicy(input: { detailRetentionDays: number; aggregateRetentionDays: number }): Promise<LogRetentionPolicy>;
  hasDeletionTombstone(conversationId: string): Promise<boolean>;
  tombstoneForConversation(conversationId: string): Promise<DeletionTombstoneRecord | null>;
  tombstone(id: string): Promise<DeletionTombstoneRecord | null>;
  pendingTombstones(limit: number): Promise<DeletionTombstoneRecord[]>;
  unfinishedTombstones(limit: number): Promise<DeletionTombstoneRecord[]>;
  /**
   * 删除**完成之后**才登记的资源（G02 迟到补写）。
   *
   * 判据是 `resource.registeredAt > tombstone.completedAt`——只认"删除完成后又冒出来的写入"，
   * 不碰删除前就已存在的任何记录，因此不会误伤正常数据。
   */
  lateWriteResources(limit: number): Promise<Array<{ tombstoneId: string; conversationId: string; resource: LogResourceRecord }>>;
  updateTombstone(input: {
    id: string;
    state: DeletionTombstoneState;
    lastErrorCode?: string | null;
    incrementAttempts?: boolean;
    completedAt?: Date | null;
  }): Promise<DeletionTombstoneRecord>;
  deleteResourceRecord(id: string): Promise<void>;
}
