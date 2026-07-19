/**
 * 后台高风险动作审计门闩（S0-05）
 *
 * 规则：高风险动作必须先写入审计事件；审计写入失败时关闭动作。
 * - 生产/预览有 Redis：写入 Redis，成功后才允许继续。
 * - 开发/测试无 Redis：写入明确的进程内审计，用于本地开发。
 * - 生产/预览无 Redis：返回 storage-unavailable，调用方必须停止动作。
 *
 * 审计只保存安全摘要，不保存邀请码明文、API Key、密码或原始私密内容。
 */
import type { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';

import { getRedis } from '@/conversation/store';
import { resolveStorageMode, type StorageMode } from '@/lib/storage-mode';

type AuditRedis = Pick<Redis, 'set' | 'lpush' | 'ltrim'>;

const AUDIT_RECENT_LIST = 'admin:audit:high-risk:recent';
const MAX_RECENT_AUDIT_EVENTS = 500;

export interface AdminAuditEvent {
  auditId: string;
  occurredAt: string;
  actor: string;
  action: string;
  targetType: string;
  targetId?: string;
  reason: string;
  detail?: Record<string, unknown>;
  severity: 'high';
}

export interface AdminAuditInput {
  actor: string;
  action: string;
  targetType: string;
  targetId?: string;
  reason: string;
  detail?: Record<string, unknown>;
}

export type AdminAuditGateResult =
  | { ok: true; event: AdminAuditEvent; storageMode: StorageMode }
  | { ok: false; code: 'storage-unavailable' | 'audit-write-failed'; status: 503; reason: string; storageMode: StorageMode };

interface AdminAuditOptions {
  redis?: AuditRedis | null;
  environment?: string;
}

const memoryAuditEvents = new Map<string, AdminAuditEvent>();

function hasInjectedRedis(options?: AdminAuditOptions): boolean {
  return Boolean(options && Object.prototype.hasOwnProperty.call(options, 'redis'));
}

function resolveRedis(options?: AdminAuditOptions): AuditRedis | null {
  return hasInjectedRedis(options) ? options?.redis ?? null : getRedis();
}

function auditKey(auditId: string): string {
  return `admin:audit:high-risk:${auditId}`;
}

function normalizeDetail(detail?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!detail) return undefined;
  const safeEntries = Object.entries(detail).filter(([key]) => {
    const lower = key.toLowerCase();
    return !lower.includes('password') && !lower.includes('token') && !lower.includes('apikey') && !lower.includes('api_key') && !lower.includes('secret');
  });
  return safeEntries.length > 0 ? Object.fromEntries(safeEntries) : undefined;
}

export function __resetMemoryAdminAudit(): void {
  memoryAuditEvents.clear();
}

export function __listMemoryAdminAudit(): AdminAuditEvent[] {
  return [...memoryAuditEvents.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export async function requireHighRiskAudit(input: AdminAuditInput, options?: AdminAuditOptions): Promise<AdminAuditGateResult> {
  const redis = resolveRedis(options);
  const storageMode = resolveStorageMode({ hasRedis: Boolean(redis), environment: options?.environment });
  if (storageMode === 'unavailable') {
    return {
      ok: false,
      code: 'storage-unavailable',
      status: 503,
      reason: '生产环境缺少持久化审计存储，高风险操作已关闭。',
      storageMode,
    };
  }

  const event: AdminAuditEvent = {
    auditId: `audit_${randomUUID()}`,
    occurredAt: new Date().toISOString(),
    actor: input.actor,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    detail: normalizeDetail(input.detail),
    severity: 'high',
  };

  try {
    memoryAuditEvents.set(event.auditId, event);
    if (redis) {
      await redis.set(auditKey(event.auditId), event);
      await redis.lpush(AUDIT_RECENT_LIST, event.auditId);
      await redis.ltrim(AUDIT_RECENT_LIST, 0, MAX_RECENT_AUDIT_EVENTS - 1);
    }
    return { ok: true, event, storageMode };
  } catch {
    memoryAuditEvents.delete(event.auditId);
    return {
      ok: false,
      code: 'audit-write-failed',
      status: 503,
      reason: '审计写入失败，高风险操作未执行。',
      storageMode,
    };
  }
}

