import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_DEADLINE_MS,
  BACKGROUND_QUEUE_LIMIT,
  MODEL_SLOT_LIMIT,
  PUBLIC_CLAIM_STREAK_LIMIT,
  PUBLIC_DEADLINE_MS,
  PUBLIC_QUEUE_LIMIT,
  admissionDeadline,
  denialReason,
  nextPublicStreak,
  queueAdmission,
  quotaHeadroom,
  selectClaim,
  slotOccupied,
} from './execution-admission.js';

describe('执行调度准入', () => {
  it('单槽、队列和含排队的截止时间使用唯一配置', () => {
    expect(MODEL_SLOT_LIMIT).toBe(1);
    expect(PUBLIC_QUEUE_LIMIT).toBe(3);
    expect(BACKGROUND_QUEUE_LIMIT).toBe(10);
    expect(PUBLIC_DEADLINE_MS).toBe(15_000);
    expect(BACKGROUND_DEADLINE_MS).toBe(120_000);
    expect(PUBLIC_CLAIM_STREAK_LIMIT).toBeGreaterThan(0);
    expect(slotOccupied(0)).toBe(false);
    expect(slotOccupied(MODEL_SLOT_LIMIT)).toBe(true);
    const now = 1_000_000;
    expect(admissionDeadline('public', now, null)).toBe(now + PUBLIC_DEADLINE_MS);
    expect(admissionDeadline('public', now, now + PUBLIC_DEADLINE_MS + 1)).toBe(now + PUBLIC_DEADLINE_MS);
    expect(admissionDeadline('admin', now, null)).toBe(now + BACKGROUND_DEADLINE_MS);
    expect(admissionDeadline('system', now, now - 1)).toBe(now - 1);
    expect(queueAdmission({ lane: 'public', waiting: PUBLIC_QUEUE_LIMIT - 1, deadline: now + 1, now })).toEqual({ ok: true });
    expect(queueAdmission({ lane: 'public', waiting: PUBLIC_QUEUE_LIMIT, deadline: now + 1, now }).ok).toBe(false);
    expect(queueAdmission({ lane: 'background', waiting: BACKGROUND_QUEUE_LIMIT, deadline: now + 1, now }).ok).toBe(false);
    expect(queueAdmission({ lane: 'public', waiting: 0, deadline: now, now }).ok).toBe(false);
  });

  it('有后台等待时，连续公共领取达到上限后下一次让行', () => {
    const waiters = [
      { id: 'background', lane: 'background' as const, createdAt: 1 },
      { id: 'public-old', lane: 'public' as const, createdAt: 2 },
      { id: 'public-new', lane: 'public' as const, createdAt: 3 },
    ];
    expect(selectClaim({ waiters, consecutivePublicClaims: PUBLIC_CLAIM_STREAK_LIMIT - 1 })?.id).toBe('public-old');
    expect(selectClaim({ waiters, consecutivePublicClaims: PUBLIC_CLAIM_STREAK_LIMIT })?.id).toBe('background');
    expect(selectClaim({
      waiters: waiters.filter((row) => row.lane === 'public'),
      consecutivePublicClaims: PUBLIC_CLAIM_STREAK_LIMIT,
    })?.id).toBe('public-old');
    expect(nextPublicStreak('public', PUBLIC_CLAIM_STREAK_LIMIT)).toBe(PUBLIC_CLAIM_STREAK_LIMIT + 1);
    expect(nextPublicStreak('background', PUBLIC_CLAIM_STREAK_LIMIT)).toBe(0);
  });

  it('最后一单位额度不能再预留，撤销、过期和越范围会拒绝', () => {
    expect(quotaHeadroom({ runLimit: 1, usageLimit: 10, runsReserved: 0, runsCharged: 0, usageReserved: 0, usageCharged: 0 })).toBe(true);
    expect(quotaHeadroom({ runLimit: 1, usageLimit: 10, runsReserved: 1, runsCharged: 0, usageReserved: 0, usageCharged: 0 })).toBe(false);
    expect(quotaHeadroom({ runLimit: 2, usageLimit: 10, runsReserved: 0, runsCharged: 1, usageReserved: 0, usageCharged: 10 })).toBe(false);
    const grant = { revokedAt: null, expiresAt: '2099-01-01T00:00:00.000Z', resourceScope: { kind: 'agent', ids: ['agent-a'] } };
    const base = { expectsGrant: true, grant, resourceKind: 'agent', resourceId: 'agent-a', now: Date.parse('2026-09-22T00:00:00.000Z') };
    expect(denialReason(base)).toBe('当前请求不允许执行');
    expect(denialReason({ ...base, grant: { ...grant, revokedAt: '2026-09-22T00:00:00.000Z' } })).toBe('授权已撤销，拒绝执行');
    expect(denialReason({ ...base, grant: null })).toBe('授权已撤销，拒绝执行');
    expect(denialReason({ ...base, grant: { ...grant, expiresAt: '2000-01-01T00:00:00.000Z' } })).toBe('授权已过期，拒绝执行');
    expect(denialReason({ ...base, resourceId: 'other' })).toBe('授权已超出原范围，拒绝执行');
  });
});
