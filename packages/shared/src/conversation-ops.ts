import type { MessageDelivery } from './conversation.js';

export type ConversationLogAgent = {
  agentId: string;
  agentName: string;
  revision: number;
};

export type ConversationLogListItem = {
  conversationId: string;
  placementKey: string;
  contentSlug: string;
  createdAt: string;
  lastActivityAt: string;
  turnCount: number;
  latestQuestion: string | null;
  latestDelivery: MessageDelivery | null;
  latestRunState: string | null;
  participants: ConversationLogAgent[];
};

export type ConversationLogPage = {
  items: ConversationLogListItem[];
  nextCursor: string | null;
  limit: 50 | 100;
};

export type ConversationLogRunEvent = {
  seq: number;
  kind: string;
  text: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
};

export type ConversationLogRun = {
  id: string;
  state: string;
  kind: string;
  createdAt: string;
  stopReason: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  elapsedMs: number | null;
  events: ConversationLogRunEvent[];
};

export type ConversationLogAttempt = {
  id: string;
  state: string;
  createdAt: string;
  agent: ConversationLogAgent & { revisionId: string; modelId: string } | null;
  run: ConversationLogRun | null;
};

export type ConversationLogMessage = {
  id: string;
  role: 'visitor' | 'assistant';
  body: string;
  delivery: MessageDelivery;
  createdAt: string;
  citations: string[] | null;
  aiUsedFlag: boolean | null;
  degradeReason: string | null;
};

export type ConversationLogTurn = {
  id: string;
  seq: number;
  createdAt: string;
  messages: ConversationLogMessage[];
  attempts: ConversationLogAttempt[];
};

export type ConversationLogInteraction = {
  id: string;
  at: string;
  featureKey: string;
  event: string;
  failCode: string | null;
  props: Record<string, unknown> | null;
};

export type ConversationLogDetail = {
  conversationId: string;
  placementKey: string;
  contentSlug: string;
  createdAt: string;
  lastActivityAt: string;
  turns: ConversationLogTurn[];
  interactions: ConversationLogInteraction[];
};

export type ConversationExportFormat = 'csv' | 'json';
export type ConversationExportState = 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' | 'REVOKED' | 'EXPIRED';
export type ConversationExportFilters = {
  from: string | null;
  to: string | null;
  contentSlug: string | null;
  placementKey: string | null;
  agentId: string | null;
  runState: string | null;
  keyword: string | null;
};
export type ConversationExportCreateInput = {
  format: ConversationExportFormat;
  filters: Partial<ConversationExportFilters>;
};
export type ConversationExportJobView = {
  id: string;
  format: ConversationExportFormat;
  state: ConversationExportState;
  filters: ConversationExportFilters;
  snapshotAt: string;
  retentionCutoff: string;
  expiresAt: string;
  rowCount: number;
  errorCode: string | null;
  downloadPath: string | null;
  fields: string[];
};

/* ========== 访客问题转更新事项的证据引用（O05） ========== */

/**
 * 事项上的证据引用。**软引用**：指向可删除、可过期的访客会话。
 *
 * 为什么刻意不加外键：会话被删除时事项必须**保留**并如实显示「证据已不可用」，
 * 加了外键就只能二选一——级联删掉事项（丢掉站主要做的事）或阻止删除（违背访客删除权）。
 */
export type ActionEvidenceRef = {
  conversationId: string;
  /** 被引用的消息 id；空数组表示只引用整段会话（站主没指定具体消息） */
  messageIds: string[];
  /** 保存引用时的时刻（UTC ISO）；用于说明「当时看到的是这一版」 */
  capturedAt: string;
};

/** 证据不可用的原因：已删除 / 已过保留期 / 会话从未存在 */
export const EVIDENCE_UNAVAILABLE_REASONS = ['deleted', 'expired', 'missing'] as const;
export type EvidenceUnavailableReason = (typeof EVIDENCE_UNAVAILABLE_REASONS)[number];

export function isEvidenceUnavailableReason(value: unknown): value is EvidenceUnavailableReason {
  return typeof value === 'string' && (EVIDENCE_UNAVAILABLE_REASONS as readonly string[]).includes(value);
}

/** 从事项回看证据的结果：要么拿到保留期内正文，要么说明为什么拿不到（绝不假装有） */
export type ActionEvidence = {
  available: boolean;
  reason: EvidenceUnavailableReason | null;
  conversationId: string | null;
  contentSlug: string | null;
  capturedAt: string | null;
  /** 仅 available=true 时有内容；否则为空数组，界面据此显示不可用原因 */
  messages: Array<Pick<ConversationLogMessage, 'id' | 'role' | 'body' | 'createdAt'>>;
};

/** 转事项时保存的最小摘要上限：摘要不是会话副本，过长即拒绝。 */
export const ACTION_SUMMARY_MAX_LENGTH = 500;

/**
 * 生成默认摘要：取访客问题（不是助手回答）的首段并截断。
 * 只做预览预填，站主可改；**不把整段会话搬进事项**。
 */
export function summarizeVisitorQuestion(body: string, maxLength = ACTION_SUMMARY_MAX_LENGTH): string {
  const collapsed = body.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength - 1)}…`;
}
