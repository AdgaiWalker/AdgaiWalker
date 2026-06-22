import { describe, expect, it } from 'vitest';

import { filterExpiredProposals, hasSufficientEvidence, isProposalExpired } from './rules';

import type { EvidenceRef, WorkItem } from '@/stores/ports';

function makeEvidence(over: Partial<EvidenceRef> = {}): EvidenceRef {
  return {
    evidenceId: `ev_${Math.random().toString(36).slice(2, 8)}`,
    sourceType: 'need-case',
    sourceId: 'nc_test',
    occurredAt: '2026-06-20T00:00:00.000Z',
    collectedAt: '2026-06-20T00:00:00.000Z',
    environment: 'development',
    visibility: 'owner',
    freshness: 'fresh',
    qualityStatus: 'verified-source',
    summary: '一条可信的原始需求',
    ...over,
  };
}

function makeWorkItem(over: Partial<WorkItem> = {}): WorkItem {
  return {
    workItemId: 'wi_test',
    queue: 'user-demand',
    title: '测试项',
    summary: 'x',
    status: 'proposal',
    priorityBand: 'week',
    priorityReasons: [],
    uncertainty: [],
    evidenceRefs: [makeEvidence()],
    decision: { requestedDecision: 'x', outcome: 'pending' },
    actions: [],
    outcomes: [],
    history: [],
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z',
    ...over,
  };
}

describe('hasSufficientEvidence', () => {
  it('空数组 → false', () => {
    expect(hasSufficientEvidence([])).toBe(false);
  });

  it('只有 unverified 证据 → false', () => {
    expect(hasSufficientEvidence([makeEvidence({ qualityStatus: 'unverified' })])).toBe(false);
  });

  it('verified-source 但 summary 为空 → false', () => {
    expect(
      hasSufficientEvidence([makeEvidence({ qualityStatus: 'verified-source', summary: '   ' })]),
    ).toBe(false);
  });

  it('有 verified-source 且 summary 非空 → true', () => {
    expect(hasSufficientEvidence([makeEvidence()])).toBe(true);
  });

  it('混合：一条 unverified + 一条 verified-source → true（任一满足即可）', () => {
    expect(
      hasSufficientEvidence([
        makeEvidence({ qualityStatus: 'unverified', summary: '弱' }),
        makeEvidence({ qualityStatus: 'partial', summary: '部分可信' }),
      ]),
    ).toBe(true);
  });

  it('partial 质量且 summary 非空 → true（非 unverified 即算）', () => {
    expect(hasSufficientEvidence([makeEvidence({ qualityStatus: 'partial' })])).toBe(true);
  });
});

describe('isProposalExpired', () => {
  const NOW = '2026-06-22T00:00:00.000Z';

  it('非 proposal 状态 → 永不过期（即便设了 expiresAt）', () => {
    const item = makeWorkItem({
      status: 'pending',
      expiresAt: '2020-01-01T00:00:00.000Z',
    });
    expect(isProposalExpired(item, NOW)).toBe(false);
  });

  it('proposal 且未设 expiresAt → 不过期', () => {
    const item = makeWorkItem({ status: 'proposal', expiresAt: undefined });
    expect(isProposalExpired(item, NOW)).toBe(false);
  });

  it('proposal 且 expiresAt > now → 未过期', () => {
    const item = makeWorkItem({ status: 'proposal', expiresAt: '2026-07-01T00:00:00.000Z' });
    expect(isProposalExpired(item, NOW)).toBe(false);
  });

  it('proposal 且 expiresAt < now → 已过期', () => {
    const item = makeWorkItem({ status: 'proposal', expiresAt: '2020-01-01T00:00:00.000Z' });
    expect(isProposalExpired(item, NOW)).toBe(true);
  });

  it('proposal 且 expiresAt === now → 未过期（严格小于才过期）', () => {
    const item = makeWorkItem({ status: 'proposal', expiresAt: NOW });
    expect(isProposalExpired(item, NOW)).toBe(false);
  });

  it('纯函数：不依赖默认 now 参数（GC5 参数化验证）', () => {
    // 同一个 item 在不同 now 下结果不同，证明 now 由调用方驱动而非内部默认
    const item = makeWorkItem({ status: 'proposal', expiresAt: '2026-06-22T12:00:00.000Z' });
    expect(isProposalExpired(item, '2026-06-22T00:00:00.000Z')).toBe(false);
    expect(isProposalExpired(item, '2026-06-23T00:00:00.000Z')).toBe(true);
  });
});

describe('filterExpiredProposals', () => {
  const NOW = '2026-06-22T00:00:00.000Z';

  it('空列表 → 空列表', () => {
    expect(filterExpiredProposals([], NOW)).toEqual([]);
  });

  it('保留所有非 proposal 项 + 未过期 proposal；剔除过期 proposal', () => {
    const pending = makeWorkItem({ workItemId: 'wi_pending', status: 'pending' });
    const freshProposal = makeWorkItem({
      workItemId: 'wi_fresh',
      status: 'proposal',
      expiresAt: '2026-07-01T00:00:00.000Z',
    });
    const expiredProposal = makeWorkItem({
      workItemId: 'wi_expired',
      status: 'proposal',
      expiresAt: '2020-01-01T00:00:00.000Z',
    });
    const noExpiryProposal = makeWorkItem({
      workItemId: 'wi_noexpiry',
      status: 'proposal',
      expiresAt: undefined,
    });
    const resolved = makeWorkItem({ workItemId: 'wi_resolved', status: 'resolved' });

    const filtered = filterExpiredProposals(
      [pending, freshProposal, expiredProposal, noExpiryProposal, resolved],
      NOW,
    );

    const ids = filtered.map(w => w.workItemId);
    expect(ids).toEqual(['wi_pending', 'wi_fresh', 'wi_noexpiry', 'wi_resolved']);
    expect(filtered).not.toContain(expiredProposal);
  });

  it('不修改原数组（纯函数）', () => {
    const items = [
      makeWorkItem({ workItemId: 'wi_a', status: 'proposal', expiresAt: '2020-01-01T00:00:00.000Z' }),
      makeWorkItem({ workItemId: 'wi_b', status: 'pending' }),
    ];
    const snapshot = items.map(w => ({ ...w }));
    filterExpiredProposals(items, NOW);
    expect(items).toEqual(snapshot);
  });
});
