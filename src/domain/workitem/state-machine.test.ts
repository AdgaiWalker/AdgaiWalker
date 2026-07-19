import { describe, expect, it } from 'vitest';

import { ALLOWED_TRANSITIONS, canTransition } from './state-machine';

import type { WorkItemStatus } from '@/stores/ports';

describe('ALLOWED_TRANSITIONS / canTransition', () => {
  describe('每条合法迁移都返回 true', () => {
    const legalCases: Array<[WorkItemStatus, WorkItemStatus]> = [
      ['proposal', 'pending'],
      ['proposal', 'accepted'],
      ['proposal', 'rejected'],
      ['proposal', 'paused'],
      ['pending', 'accepted'],
      ['pending', 'rejected'],
      ['pending', 'paused'],
      ['pending', 'proposal'],
      ['accepted', 'acting'],
      ['accepted', 'paused'],
      ['accepted', 'rejected'],
      ['paused', 'pending'],
      ['paused', 'proposal'],
      ['paused', 'rejected'],
      ['acting', 'awaiting-verification'],
      ['acting', 'resolved'],
      ['acting', 'paused'],
      ['awaiting-verification', 'resolved'],
      ['awaiting-verification', 'acting'],
      ['awaiting-verification', 'paused'],
    ];

    for (const [from, to] of legalCases) {
      it(`${from} → ${to} 合法`, () => {
        expect(canTransition(from, to)).toBe(true);
        // 与白名单表保持一致：该 (from, to) 必须出现在 ALLOWED_TRANSITIONS[from] 里
        expect(ALLOWED_TRANSITIONS[from]).toContain(to);
      });
    }
  });

  describe('终态拒绝所有后继迁移', () => {
    const allStatuses: WorkItemStatus[] = [
      'proposal',
      'pending',
      'accepted',
      'rejected',
      'paused',
      'acting',
      'awaiting-verification',
      'resolved',
    ];

    for (const terminal of ['resolved', 'rejected'] as const) {
      it(`终态 ${terminal} 对所有目标状态（含自身）都拒绝`, () => {
        expect(ALLOWED_TRANSITIONS[terminal]).toEqual([]);
        for (const target of allStatuses) {
          expect(canTransition(terminal, target)).toBe(false);
        }
      });
    }
  });

  describe('关键非法迁移对返回 false', () => {
    const illegalCases: Array<[WorkItemStatus, WorkItemStatus]> = [
      // 跳跃：proposal 不能直接进入 acting / awaiting-verification / resolved
      ['proposal', 'acting'],
      ['proposal', 'awaiting-verification'],
      ['proposal', 'resolved'],
      // 回流：accepted 不能退回 pending / proposal
      ['accepted', 'pending'],
      ['accepted', 'proposal'],
      // paused 不能直接跳到 accepted / acting（必须先回 pending/proposal）
      ['paused', 'accepted'],
      ['paused', 'acting'],
      // acting 不能退回 pending / accepted / proposal
      ['acting', 'pending'],
      ['acting', 'accepted'],
      ['acting', 'proposal'],
      // awaiting-verification 不能回 proposal / pending / accepted
      ['awaiting-verification', 'proposal'],
      ['awaiting-verification', 'pending'],
      ['awaiting-verification', 'accepted'],
      // 自身→自身 一律视为"无变化"，按非法处理（白名单不含自身）
      ['proposal', 'proposal'],
      ['pending', 'pending'],
      ['acting', 'acting'],
    ];

    for (const [from, to] of illegalCases) {
      it(`${from} → ${to} 非法`, () => {
        expect(canTransition(from, to)).toBe(false);
      });
    }
  });

  it('ALLOWED_TRANSITIONS 覆盖全部 8 个状态作为 key', () => {
    const keys = Object.keys(ALLOWED_TRANSITIONS);
    expect(keys).toEqual(
      expect.arrayContaining([
        'proposal',
        'pending',
        'accepted',
        'rejected',
        'paused',
        'acting',
        'awaiting-verification',
        'resolved',
      ]),
    );
    expect(keys).toHaveLength(8);
  });
});
