/**
 * 可见性服务 — 数据边界控制
 *
 * 决定 public / invited / admin 各角色能看到什么。
 */

import type { VisibilityServicePort } from './interfaces';
import type { DemandEvent } from '@/stores/ports';

export function createVisibilityService(): VisibilityServicePort {
  return {
    canSee({ role, contentVisibility }) {
      if (role === 'admin') return true;
      if (role === 'invited') {
        return contentVisibility === 'public' || contentVisibility === 'draft';
      }
      // public 角色
      return contentVisibility === 'public';
    },

    redactDemandEvent(event: unknown, role) {
      const e = event as DemandEvent;
      if (role === 'admin') return e;

      // invited 和 public 只看聚合摘要
      return {
        needSummary: e.needSummary,
        needCategories: e.needCategories,
        frictionLayer: e.frictionLayer,
        recommendedAbilityType: e.recommendedAbilityType,
        createdAt: e.createdAt,
      };
    },

    filterStats(stats: unknown, role) {
      const s = stats as Record<string, unknown>;
      if (role === 'admin') return s;

      // public / invited 只看聚合字段
      return {
        matchCount: s.matchCount,
        contentCount: s.contentCount,
        topCategories: s.topCategories,
      };
    },
  };
}
