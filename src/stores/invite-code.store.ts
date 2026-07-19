/**
 * 邀请码 Store — 环境变量定义 + Redis/内存使用次数
 *
 * 从 INVITE_CODES 环境变量读取邀请码列表：
 * code1:label1:maxUses1,code2:label2:maxUses2
 * 例如：walker-test-2026:测试批次:10,alpha-preview:内测:5
 */

import { createHash } from 'node:crypto';

import type { InviteCode, InviteCodeRepositoryPort } from './ports';
import { getRedis } from '@/stores/redis-client';

function usageKey(code: string): string {
  const hash = createHash('sha256').update(code).digest('hex').slice(0, 24);
  return `auth:invite-code:usage:${hash}`;
}

export function createInviteCodeStore(): InviteCodeRepositoryPort {
  const cache = new Map<string, InviteCode>();
  const usageCounts = new Map<string, number>();

  function loadFromEnv(): void {
    const raw = import.meta.env.INVITE_CODES ?? '';
    if (!raw || cache.size > 0) return;

    for (const entry of String(raw).split(',')) {
      const parts = entry.trim().split(':');
      if (parts.length < 1) continue;
      const code = parts[0].trim();
      if (!code) continue;
      cache.set(code, {
        code,
        createdAt: new Date().toISOString(),
        maxUses: parts.length >= 3 ? Number(parts[2]) || 10 : 10,
        usedCount: usageCounts.get(code) ?? 0,
        label: parts.length >= 2 ? parts[1].trim() : undefined,
      });
    }
  }

  return {
    async findByCode(code: string): Promise<InviteCode | null> {
      loadFromEnv();
      const invite = cache.get(code);
      if (!invite) return null;

      let usedCount = usageCounts.get(code) ?? invite.usedCount;
      const redis = getRedis();
      if (redis) {
        try {
          usedCount = (await redis.get<number>(usageKey(code))) ?? usedCount;
        } catch {
          // Redis hiccups should not make local development invite flow unusable.
        }
      }

      invite.usedCount = usedCount;
      return { ...invite };
    },

    async incrementUsage(code: string): Promise<number> {
      loadFromEnv();
      const current = usageCounts.get(code) ?? cache.get(code)?.usedCount ?? 0;
      let next = current + 1;

      const redis = getRedis();
      if (redis) {
        try {
          next = await redis.incr(usageKey(code));
        } catch {
          // Fall back to process-local counting when Redis is unavailable.
        }
      }

      usageCounts.set(code, next);
      const cached = cache.get(code);
      if (cached) cached.usedCount = next;
      return next;
    },

    async listAll(): Promise<InviteCode[]> {
      loadFromEnv();
      return [...cache.values()];
    },
  };
}
