/**
 * VisibilityService TDD — 数据边界控制行为
 *
 * RED 阶段：测试约束以下行为：
 * 1. admin 能看所有可见性级别
 * 2. invited 能看 public + draft，不能看 private / admin-only
 * 3. public 只能看 public，不能看 draft / private / admin-only
 * 4. redactDemandEvent 对非 admin 只返回摘要字段
 * 5. filterStats 对非 admin 只返回聚合字段
 */

import { describe, it, expect } from 'vitest';
import { createVisibilityService } from '@/services/visibility.service';

describe('VisibilityService — 数据边界控制', () => {
  const service = createVisibilityService();

  describe('canSee — 可见性规则矩阵', () => {
    // admin 角色能看一切
    it('admin 能看 public', () => {
      expect(service.canSee({ role: 'admin', contentVisibility: 'public' })).toBe(true);
    });
    it('admin 能看 draft', () => {
      expect(service.canSee({ role: 'admin', contentVisibility: 'draft' })).toBe(true);
    });
    it('admin 能看 private', () => {
      expect(service.canSee({ role: 'admin', contentVisibility: 'private' })).toBe(true);
    });
    it('admin 能看 admin-only', () => {
      expect(service.canSee({ role: 'admin', contentVisibility: 'admin-only' })).toBe(true);
    });

    // invited 角色
    it('invited 能看 public', () => {
      expect(service.canSee({ role: 'invited', contentVisibility: 'public' })).toBe(true);
    });
    it('invited 能看 draft', () => {
      expect(service.canSee({ role: 'invited', contentVisibility: 'draft' })).toBe(true);
    });
    it('invited 不能看 private', () => {
      expect(service.canSee({ role: 'invited', contentVisibility: 'private' })).toBe(false);
    });
    it('invited 不能看 admin-only', () => {
      expect(service.canSee({ role: 'invited', contentVisibility: 'admin-only' })).toBe(false);
    });

    // public 角色
    it('public 只能看 public', () => {
      expect(service.canSee({ role: 'public', contentVisibility: 'public' })).toBe(true);
    });
    it('public 不能看 draft', () => {
      expect(service.canSee({ role: 'public', contentVisibility: 'draft' })).toBe(false);
    });
    it('public 不能看 private', () => {
      expect(service.canSee({ role: 'public', contentVisibility: 'private' })).toBe(false);
    });
    it('public 不能看 admin-only', () => {
      expect(service.canSee({ role: 'public', contentVisibility: 'admin-only' })).toBe(false);
    });
  });

  describe('redactDemandEvent — 需求事件脱敏', () => {
    const fullEvent = {
      eventId: 'evt-001',
      sessionId: 'sess-001',
      rawNeedRedacted: '用户原始问题（已脱敏）',
      needSummary: '想学 AI',
      needCategories: ['learn-ai'],
      isMinorContext: false,
      piiDetected: false,
      piiRemoved: false,
      recommendedContentIds: ['tools-ai-tools'],
      status: 'pending' as const,
      createdAt: '2026-06-10T00:00:00Z',
    };

    it('admin 看到完整事件', () => {
      const result = service.redactDemandEvent(fullEvent, 'admin') as Record<string, unknown>;
      expect(result.eventId).toBe('evt-001');
      expect(result.rawNeedRedacted).toBe('用户原始问题（已脱敏）');
    });

    it('invited 只看到摘要', () => {
      const result = service.redactDemandEvent(fullEvent, 'invited') as Record<string, unknown>;
      expect(result.needSummary).toBe('想学 AI');
      expect(result).not.toHaveProperty('eventId');
      expect(result).not.toHaveProperty('rawNeedRedacted');
    });

    it('public 只看到摘要', () => {
      const result = service.redactDemandEvent(fullEvent, 'public') as Record<string, unknown>;
      expect(result.needSummary).toBe('想学 AI');
      expect(result).not.toHaveProperty('eventId');
    });
  });

  describe('filterStats — 统计信息可见性', () => {
    const fullStats = {
      matchCount: 42,
      contentCount: 15,
      topCategories: [{ id: 'learn-ai', label: '学 AI', count: 10 }],
      totalEvents: 100,
      byCategory: { coding: 30, writing: 20 },
      complianceRedirectRate: 0.05,
    };

    it('admin 看到完整统计', () => {
      const result = service.filterStats(fullStats, 'admin') as Record<string, unknown>;
      expect(result.totalEvents).toBe(100);
      expect(result.complianceRedirectRate).toBe(0.05);
    });

    it('invited 只看聚合字段', () => {
      const result = service.filterStats(fullStats, 'invited') as Record<string, unknown>;
      expect(result.matchCount).toBe(42);
      expect(result).not.toHaveProperty('complianceRedirectRate');
    });

    it('public 只看聚合字段', () => {
      const result = service.filterStats(fullStats, 'public') as Record<string, unknown>;
      expect(result.contentCount).toBe(15);
      expect(result).not.toHaveProperty('byCategory');
    });
  });
});
