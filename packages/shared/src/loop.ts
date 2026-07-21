import type { CluePoolStatus } from './clue.js';
import type { DeliveryInput, ReviewInput } from './execution.js';
import { isValidDelivery, isValidReview } from './execution.js';
import type { SeedClueLink } from './seed.js';
import { canPromoteToPrimary } from './seed.js';

export interface CountableLoopInput {
  links: readonly SeedClueLink[];
  delivery: DeliveryInput;
  review: ReviewInput;
}

/**
 * 可计数闭环：
 * in-pool 线索挂主选 + 合法交付 + outcome∈{yes,no} +（no⇒证据）
 * unclear 不计入可计数闭环。
 */
export function isCountableLoop(input: CountableLoopInput): boolean {
  if (!canPromoteToPrimary(input.links)) return false;
  if (!isValidDelivery(input.delivery)) return false;
  if (input.review.outcome === 'unclear') return false;
  if (!isValidReview(input.review)) return false;
  return true;
}

export interface GraduationProgressInput {
  countableLoops: number;
  yesCount: number;
  externalLoopCount: number;
}

export interface GraduationProgress {
  countableLoops: number;
  yesCount: number;
  externalLoopCount: number;
  met:
    | false
    | {
        byMetrics: true;
      };
  /** 方案 §6：可计数≥5 且 yes≥2 且 外部闭环≥1 */
  readyByMetrics: boolean;
}

export function graduationProgress(
  input: GraduationProgressInput,
): GraduationProgress {
  const readyByMetrics =
    input.countableLoops >= 5 &&
    input.yesCount >= 2 &&
    input.externalLoopCount >= 1;
  return {
    countableLoops: input.countableLoops,
    yesCount: input.yesCount,
    externalLoopCount: input.externalLoopCount,
    met: readyByMetrics ? { byMetrics: true } : false,
    readyByMetrics,
  };
}

/** 连续 3 次 no/unclear → spin-risk（仅警告语义，不锁写） */
export function hasSpinRisk(recentOutcomes: readonly string[]): boolean {
  if (recentOutcomes.length < 3) return false;
  const last3 = recentOutcomes.slice(-3);
  return last3.every((o) => o === 'no' || o === 'unclear');
}

export function isInPool(status: CluePoolStatus): boolean {
  return status === 'in-pool';
}
