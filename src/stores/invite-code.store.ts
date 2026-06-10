/**
 * 邀请码 Store — 环境变量实现
 *
 * 第一版：从 INVITE_CODES 环境变量读取邀请码列表。
 * 格式：code1:label1:maxUses1,code2:label2:maxUses2
 * 例如：walker-test-2026:测试批次:10,alpha-preview:内测:5
 */

import type { InviteCode, InviteCodeRepositoryPort } from './ports';

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
      return cache.get(code) ?? null;
    },

    async incrementUsage(code: string): Promise<void> {
      const current = usageCounts.get(code) ?? 0;
      usageCounts.set(code, current + 1);
      const cached = cache.get(code);
      if (cached) cached.usedCount = current + 1;
    },

    async listAll(): Promise<InviteCode[]> {
      loadFromEnv();
      return [...cache.values()];
    },
  };
}
