/**
 * 共享内容发布锁协议（PRD C13 规范）
 * 供应用服务（ContentReleaseService / ContentMutationService）与发布脚本（scripts/content-publish.ts）跨进程共用。
 */
import { isRecord } from './guards.js';

export interface ContentLockPayload {
  lockId: string;
  owner: string;
  pid: number;
  acquiredAt: string;
  expiresAt: string;
  targetSlug?: string | null;
  manifestHash?: string | null;
}

export const CONTENT_LOCK_DEFAULT_TTL_MS = 5 * 60 * 1000; // 默认 5 分钟超时，防止崩溃死锁

export function isContentLockExpired(payload: ContentLockPayload, now = Date.now()): boolean {
  const expiresAtMs = Date.parse(payload.expiresAt);
  if (!Number.isFinite(expiresAtMs)) return true;
  return now >= expiresAtMs;
}

export function parseContentLockPayload(raw: unknown): ContentLockPayload | null {
  if (!isRecord(raw)) return null;
  if (
    typeof raw.lockId !== 'string' ||
    typeof raw.owner !== 'string' ||
    typeof raw.pid !== 'number' ||
    !Number.isInteger(raw.pid) ||
    raw.pid <= 0 ||
    typeof raw.acquiredAt !== 'string' ||
    typeof raw.expiresAt !== 'string'
  ) {
    return null;
  }
  return {
    lockId: raw.lockId,
    owner: raw.owner,
    pid: raw.pid,
    acquiredAt: raw.acquiredAt,
    expiresAt: raw.expiresAt,
    targetSlug: typeof raw.targetSlug === 'string' ? raw.targetSlug : null,
    manifestHash: typeof raw.manifestHash === 'string' ? raw.manifestHash : null,
  };
}
