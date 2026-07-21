import type { CluePoolStatus } from './clue.js';

export type InterestLevel = 'low' | 'mid' | 'high';

export type SeedLinkRole = 'primary' | 'backup';

export interface SeedClueLink {
  clueId: string;
  poolStatus: CluePoolStatus;
  role: SeedLinkRole;
}

/** 两问：严重度 + 自利兴趣 */
export interface SeedTwoQuestions {
  severity: InterestLevel;
  selfInterest: InterestLevel;
}

const LEVELS: readonly InterestLevel[] = ['low', 'mid', 'high'] as const;

export function isInterestLevel(value: string): value is InterestLevel {
  return (LEVELS as readonly string[]).includes(value);
}

export function isValidTwoQuestions(q: SeedTwoQuestions): boolean {
  return isInterestLevel(q.severity) && isInterestLevel(q.selfInterest);
}

/**
 * 主选必须至少挂 1 条 in-pool 线索。
 * 不满足则不可 promote。
 */
export function assertPrimaryHasClue(links: readonly SeedClueLink[]): void {
  const hasInPool = links.some(
    (l) => l.role === 'primary' && l.poolStatus === 'in-pool',
  );
  if (!hasInPool) {
    throw new Error('missing-clue');
  }
}

export function canPromoteToPrimary(links: readonly SeedClueLink[]): boolean {
  try {
    assertPrimaryHasClue(links);
    return true;
  } catch {
    return false;
  }
}

/**
 * 全局 primary 唯一：将新 primary 之外的旧 primary 降为 backup。
 * 纯函数，返回新 links 数组。
 */
export function rebalancePrimary(
  links: readonly SeedClueLink[],
  newPrimaryClueId: string,
): SeedClueLink[] {
  return links.map((l) => {
    if (l.clueId === newPrimaryClueId) {
      return { ...l, role: 'primary' as const };
    }
    if (l.role === 'primary') {
      return { ...l, role: 'backup' as const };
    }
    return { ...l };
  });
}

/** 统计 primary 数量（全局应为 0 或 1） */
export function countPrimary(links: readonly SeedClueLink[]): number {
  return links.filter((l) => l.role === 'primary').length;
}
