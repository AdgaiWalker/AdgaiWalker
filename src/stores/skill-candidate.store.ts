/**
 * Skill Candidate Store
 *
 * Skill 候选（U11 Skill 准入：candidate → admitted / demoted-to-method）
 * 域的真实存储实现（Redis + 内存降级）。
 * 原先寄居于 conversation/store.ts，现迁入本域 Store，保持四层架构的数据边界。
 *
 * 键约定：
 *   match:skill:{skillId}     单实体
 *   match:skills:recent        最近 Skill 索引（LPUSH id + LTRIM 500）
 *
 * P4 自动注册护栏：边界 / 反例 / 验证集 / 注册层级 / 准入快照（可回滚）。
 */
import { getRedis } from '@/stores/redis-client';

import type {
  SkillAdmissionSnapshot,
  SkillAdmissionStatus,
  SkillCandidate,
  SkillEvalCase,
  SkillRegistrationTier,
} from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储
// ---------------------------------------------------------------------------

const memorySkillCandidates = new Map<string, SkillCandidate>();

// ---------------------------------------------------------------------------
// Redis key 约定
// ---------------------------------------------------------------------------

function skillKey(skillId: string): string {
  return `match:skill:${skillId}`;
}

// ---------------------------------------------------------------------------
// Skill Candidate CRUD
// ---------------------------------------------------------------------------

export async function saveSkillCandidate(skill: SkillCandidate): Promise<void> {
  const redis = getRedis();
  memorySkillCandidates.set(skill.skillId, skill);
  if (!redis) return;
  await redis.set(skillKey(skill.skillId), skill);
  await redis.lpush('match:skills:recent', skill.skillId);
  await redis.ltrim('match:skills:recent', 0, 499);
}

/** 仅测试用：清空内存 SkillCandidate，不触碰 Redis。 */
export function __resetMemorySkillCandidates(): void {
  memorySkillCandidates.clear();
}

export async function findRecentSkillCandidates(limit = 50): Promise<SkillCandidate[]> {
  const redis = getRedis();
  if (!redis) {
    return [...memorySkillCandidates.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  try {
    const ids = await redis.lrange<string>('match:skills:recent', 0, Math.max(0, limit - 1));
    const items = await Promise.all(ids.map(id => redis.get<SkillCandidate>(skillKey(id))));
    return items.filter((s): s is SkillCandidate => s !== null);
  } catch {
    return [];
  }
}

export async function findSkillCandidatesByAdmission(status: SkillAdmissionStatus): Promise<SkillCandidate[]> {
  const all = await findRecentSkillCandidates(500);
  return all.filter(skill => skill.admissionStatus === status);
}

export async function updateSkillAdmission(skillId: string, admissionStatus: SkillAdmissionStatus): Promise<void> {
  const redis = getRedis();
  const existing = memorySkillCandidates.get(skillId);
  if (existing) {
    memorySkillCandidates.set(skillId, { ...existing, admissionStatus, updatedAt: new Date().toISOString() });
  }
  if (!redis) return;
  try {
    const current = await redis.get<SkillCandidate>(skillKey(skillId));
    if (current) {
      await redis.set(skillKey(skillId), { ...current, admissionStatus, updatedAt: new Date().toISOString() });
    }
  } catch { /* 静默 */ }
}

/** P4：按 ID 取单个 SkillCandidate（pause/rollback 用）。 */
export async function getSkillCandidateById(skillId: string): Promise<SkillCandidate | null> {
  const redis = getRedis();
  const fromMemory = memorySkillCandidates.get(skillId) ?? null;
  if (!redis) return fromMemory;
  try {
    return (await redis.get<SkillCandidate>(skillKey(skillId))) ?? fromMemory;
  } catch {
    return fromMemory;
  }
}

/**
 * P4：写入 Skill 注册护栏字段（边界/反例/验证集/注册层级）+ 准入状态 + 快照。
 * 由 AssetService.promote 在注册到 admitted 时调用。
 */
export async function updateSkillRegistration(
  skillId: string,
  fields: {
    admissionStatus: SkillAdmissionStatus;
    registrationTier?: SkillRegistrationTier;
    applicableBoundary?: string;
    failureBoundary?: string;
    positiveExamples?: string[];
    negativeExamples?: string[];
    evalSet?: SkillEvalCase[];
    snapshot: SkillAdmissionSnapshot;
  },
): Promise<void> {
  const redis = getRedis();
  const existing = memorySkillCandidates.get(skillId);
  if (existing) {
    memorySkillCandidates.set(skillId, {
      ...existing,
      admissionStatus: fields.admissionStatus,
      registrationTier: fields.registrationTier ?? existing.registrationTier,
      applicableBoundary: fields.applicableBoundary ?? existing.applicableBoundary,
      failureBoundary: fields.failureBoundary ?? existing.failureBoundary,
      positiveExamples: fields.positiveExamples ?? existing.positiveExamples,
      negativeExamples: fields.negativeExamples ?? existing.negativeExamples,
      evalSet: fields.evalSet ?? existing.evalSet,
      admissionSnapshots: [...(existing.admissionSnapshots ?? []), fields.snapshot],
      updatedAt: new Date().toISOString(),
    });
  }
  if (!redis) return;
  try {
    const current = await redis.get<SkillCandidate>(skillKey(skillId));
    if (current) {
      const merged: SkillCandidate = {
        ...current,
        admissionStatus: fields.admissionStatus,
        registrationTier: fields.registrationTier ?? current.registrationTier,
        applicableBoundary: fields.applicableBoundary ?? current.applicableBoundary,
        failureBoundary: fields.failureBoundary ?? current.failureBoundary,
        positiveExamples: fields.positiveExamples ?? current.positiveExamples,
        negativeExamples: fields.negativeExamples ?? current.negativeExamples,
        evalSet: fields.evalSet ?? current.evalSet,
        admissionSnapshots: [...(current.admissionSnapshots ?? []), fields.snapshot],
        updatedAt: new Date().toISOString(),
      };
      await redis.set(skillKey(skillId), merged);
    }
  } catch { /* 静默 */ }
}

/**
 * P4：暂停 / 恢复一个已注册 Skill（运行时开关，与 admissionStatus 正交）。
 * paused 的 admitted Skill 不被 Agent 调用（spec §28 受控注册：可暂停）。
 */
export async function setSkillPaused(
  skillId: string,
  paused: boolean,
  reason: string,
  snapshot?: SkillAdmissionSnapshot,
): Promise<void> {
  const redis = getRedis();
  const ts = new Date().toISOString();
  const existing = memorySkillCandidates.get(skillId);
  if (existing) {
    memorySkillCandidates.set(skillId, {
      ...existing,
      paused,
      pausedReason: paused ? reason : undefined,
      pausedAt: paused ? ts : undefined,
      admissionSnapshots: snapshot ? [...(existing.admissionSnapshots ?? []), snapshot] : existing.admissionSnapshots,
      updatedAt: ts,
    });
  }
  if (!redis) return;
  try {
    const current = await redis.get<SkillCandidate>(skillKey(skillId));
    if (current) {
      const merged: SkillCandidate = {
        ...current,
        paused,
        pausedReason: paused ? reason : undefined,
        pausedAt: paused ? ts : undefined,
        admissionSnapshots: snapshot ? [...(current.admissionSnapshots ?? []), snapshot] : current.admissionSnapshots,
        updatedAt: ts,
      };
      await redis.set(skillKey(skillId), merged);
    }
  } catch { /* 静默 */ }
}

/**
 * P4：从一个准入快照回滚 Skill 的 admission 状态（spec §28 可回滚）。
 * 只恢复 admission 相关字段（status/tier/paused），不动 boundary/evalSet 本体。
 * 调用方负责按 toVersion 选出快照后传入。
 */
export async function rollbackSkillAdmission(
  skillId: string,
  snapshot: SkillAdmissionSnapshot,
): Promise<void> {
  const redis = getRedis();
  const ts = new Date().toISOString();
  const apply = (s: SkillCandidate): SkillCandidate => ({
    ...s,
    admissionStatus: snapshot.admissionStatus,
    registrationTier: snapshot.registrationTier ?? s.registrationTier,
    paused: snapshot.paused ?? false,
    pausedReason: snapshot.paused ? (s.pausedReason ?? '回滚恢复') : undefined,
    pausedAt: snapshot.paused ? (s.pausedAt ?? ts) : undefined,
    admissionSnapshots: [...(s.admissionSnapshots ?? []), snapshot],
    updatedAt: ts,
  });
  const existing = memorySkillCandidates.get(skillId);
  if (existing) memorySkillCandidates.set(skillId, apply(existing));
  if (!redis) return;
  try {
    const current = await redis.get<SkillCandidate>(skillKey(skillId));
    if (current) await redis.set(skillKey(skillId), apply(current));
  } catch { /* 静默 */ }
}
