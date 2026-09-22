import type { RunOrigin } from './agent-execution.js';

/** 调度只读这一组数。公平让行的连续上限也只有这一份。 */
export const MODEL_SLOT_LIMIT = 1;
export const PUBLIC_QUEUE_LIMIT = 3;
export const BACKGROUND_QUEUE_LIMIT = 10;
export const PUBLIC_DEADLINE_MS = 15_000;
export const BACKGROUND_DEADLINE_MS = 120_000;
export const PUBLIC_CLAIM_STREAK_LIMIT = 2;

export const SLOT_OCCUPYING_STATES = ['CLAIMED', 'RUNNING', 'STOPPING', 'UNKNOWN'] as const;

export type QueueLane = 'public' | 'background';

export function queueLane(origin: RunOrigin): QueueLane {
  return origin === 'public' ? 'public' : 'background';
}

export function queueLimit(lane: QueueLane): number {
  return lane === 'public' ? PUBLIC_QUEUE_LIMIT : BACKGROUND_QUEUE_LIMIT;
}

/** 公共截止不能被请求延长；显式早于现在的截止保持过期。后台默认为 120 秒，更长任务可单独指定。 */
export function admissionDeadline(origin: RunOrigin, now: number, requested: number | null): number {
  if (origin === 'public') {
    const cap = now + PUBLIC_DEADLINE_MS;
    return requested === null ? cap : Math.min(requested, cap);
  }
  return requested === null ? now + BACKGROUND_DEADLINE_MS : requested;
}

export function queueAdmission(input: {
  lane: QueueLane;
  waiting: number;
  deadline: number;
  now: number;
}): { ok: true } | { ok: false; reason: string } {
  if (input.deadline <= input.now) return { ok: false, reason: '排队截止时间已过，已改为规则处理' };
  if (input.waiting >= queueLimit(input.lane)) {
    const lane = input.lane === 'public' ? '公共' : '后台';
    return { ok: false, reason: `${lane}等待已满，已改为规则处理` };
  }
  return { ok: true };
}

export function slotOccupied(active: number): boolean {
  return active >= MODEL_SLOT_LIMIT;
}

export interface AdmissionWaiter {
  id: string;
  lane: QueueLane;
  createdAt: number;
}

function byAge(left: AdmissionWaiter, right: AdmissionWaiter): number {
  return left.createdAt - right.createdAt || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

/** 有后台在等时，公共连续领取达到上限后的下一次必须是后台。没有后台在等时公共继续优先。 */
export function selectClaim(input: {
  waiters: readonly AdmissionWaiter[];
  consecutivePublicClaims: number;
}): AdmissionWaiter | null {
  const publicWaiting = input.waiters.filter((row) => row.lane === 'public').sort(byAge);
  const backgroundWaiting = input.waiters.filter((row) => row.lane === 'background').sort(byAge);
  if (backgroundWaiting.length > 0 && publicWaiting.length > 0 &&
      input.consecutivePublicClaims >= PUBLIC_CLAIM_STREAK_LIMIT) return backgroundWaiting[0];
  if (publicWaiting.length > 0) return publicWaiting[0];
  return backgroundWaiting[0] ?? null;
}

export function nextPublicStreak(lane: QueueLane, consecutivePublicClaims: number): number {
  return lane === 'public' ? consecutivePublicClaims + 1 : 0;
}

export function quotaHeadroom(input: {
  runLimit: number | null;
  usageLimit: number | null;
  runsReserved: number;
  runsCharged: number;
  usageReserved: number;
  usageCharged: number;
}): boolean {
  const runsOpen = input.runLimit === null || input.runsReserved + input.runsCharged < input.runLimit;
  const usageOpen = input.usageLimit === null || input.usageReserved + input.usageCharged < input.usageLimit;
  return runsOpen && usageOpen;
}

export function denialReason(input: {
  expectsGrant: boolean;
  grant: { revokedAt: string | null; expiresAt: string | null; resourceScope: { kind: string; ids: readonly string[] } } | null;
  resourceKind: string;
  resourceId: string;
  now: number;
}): string {
  if (!input.expectsGrant) return '当前请求不允许执行';
  if (!input.grant || input.grant.revokedAt !== null) return '授权已撤销，拒绝执行';
  if (input.grant.expiresAt === null || Date.parse(input.grant.expiresAt) <= input.now) return '授权已过期，拒绝执行';
  if (input.grant.resourceScope.kind !== input.resourceKind || !input.grant.resourceScope.ids.includes(input.resourceId)) {
    return '授权已超出原范围，拒绝执行';
  }
  return '当前请求不允许执行';
}
