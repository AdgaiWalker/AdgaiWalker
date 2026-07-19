/**
 * Rule Candidate Store
 *
 * 规则候选（U9 规则候选池：observed → candidate → validated → stable → retired）
 * 域的真实存储实现（Redis + 内存降级）。
 * 原先寄居于 conversation/store.ts，现迁入本域 Store，保持四层架构的数据边界。
 *
 * 键约定：
 *   match:rule:{ruleId}     单实体
 *   match:rules:recent      最近规则索引（LPUSH id + LTRIM 500）
 */
import { getRedis } from '@/stores/redis-client';

import type { RuleCandidate } from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储
// ---------------------------------------------------------------------------

const memoryRuleCandidates = new Map<string, RuleCandidate>();

// ---------------------------------------------------------------------------
// Redis key 约定
// ---------------------------------------------------------------------------

function ruleKey(ruleId: string): string {
  return `match:rule:${ruleId}`;
}

// ---------------------------------------------------------------------------
// Rule Candidate CRUD
// ---------------------------------------------------------------------------

export async function saveRuleCandidate(rule: RuleCandidate): Promise<void> {
  const redis = getRedis();
  memoryRuleCandidates.set(rule.ruleId, rule);
  if (!redis) return;
  await redis.set(ruleKey(rule.ruleId), rule);
  await redis.lpush('match:rules:recent', rule.ruleId);
  await redis.ltrim('match:rules:recent', 0, 499);
}

export async function findRecentRuleCandidates(limit = 50): Promise<RuleCandidate[]> {
  const redis = getRedis();
  if (!redis) {
    return [...memoryRuleCandidates.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  try {
    const ids = await redis.lrange<string>('match:rules:recent', 0, Math.max(0, limit - 1));
    const items = await Promise.all(ids.map(id => redis.get<RuleCandidate>(ruleKey(id))));
    return items.filter((r): r is RuleCandidate => r !== null);
  } catch {
    return [];
  }
}

export async function updateRuleStatus(ruleId: string, status: RuleCandidate['status'], note?: string): Promise<void> {
  const redis = getRedis();
  const existing = memoryRuleCandidates.get(ruleId);
  if (existing) {
    memoryRuleCandidates.set(ruleId, { ...existing, status, note: note ?? existing.note, updatedAt: new Date().toISOString() });
  }
  if (!redis) return;
  try {
    const current = await redis.get<RuleCandidate>(ruleKey(ruleId));
    if (current) {
      await redis.set(ruleKey(ruleId), { ...current, status, note: note ?? current.note, updatedAt: new Date().toISOString() });
    }
  } catch { /* 静默 */ }
}
