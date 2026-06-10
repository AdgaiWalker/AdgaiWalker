/**
 * InviteService TDD — 邀请码验证行为
 *
 * RED 阶段：测试约束以下行为：
 * 1. 有效邀请码 → admitted: true
 * 2. 无效邀请码 → admitted: false, reason 包含"无效"
 * 3. 已用完邀请码 → admitted: false, reason 包含"已用完"
 * 4. 空码 → admitted: false, reason 包含"输入"
 * 5. 管理员 cookie 直接通过 → 需在 API 层测试，此处只测 service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { InviteCodeRepositoryPort, InviteCode } from '@/stores/ports';

// --- Fake store（不依赖 Redis / 环境变量）---

function createFakeInviteCodeStore(codes: Map<string, InviteCode>): InviteCodeRepositoryPort {
  return {
    async findByCode(code) { return codes.get(code) ?? null; },
    async incrementUsage(code) {
      const existing = codes.get(code);
      if (existing) { existing.usedCount++; codes.set(code, existing); }
    },
    async listAll() { return [...codes.values()]; },
  };
}

// --- 动态导入 service（避免 Astro 环境变量副作用）---

async function createService(codes: Map<string, InviteCode>) {
  const { createInviteService } = await import('@/services/invite.service');
  return createInviteService({ inviteCodeStore: createFakeInviteCodeStore(codes) });
}

describe('InviteService — 邀请码验证行为', () => {
  it('有效邀请码 → 准入成功', async () => {
    const codes = new Map<string, InviteCode>();
    codes.set('alpha-001', {
      code: 'alpha-001',
      createdAt: new Date().toISOString(),
      maxUses: 10,
      usedCount: 0,
      label: '内测',
    });
    const service = await createService(codes);
    const result = await service.verifyAndAdmit('alpha-001');
    expect(result.admitted).toBe(true);
    expect(result.code).toBe('alpha-001');
  });

  it('无效邀请码 → 拒绝准入', async () => {
    const codes = new Map<string, InviteCode>();
    const service = await createService(codes);
    const result = await service.verifyAndAdmit('nonexistent-code');
    expect(result.admitted).toBe(false);
    expect(result.reason).toContain('无效');
  });

  it('已用完邀请码 → 拒绝准入', async () => {
    const codes = new Map<string, InviteCode>();
    codes.set('exhausted', {
      code: 'exhausted',
      createdAt: new Date().toISOString(),
      maxUses: 2,
      usedCount: 2,
      label: '已耗尽',
    });
    const service = await createService(codes);
    const result = await service.verifyAndAdmit('exhausted');
    expect(result.admitted).toBe(false);
    expect(result.reason).toContain('已用完');
  });

  it('空码 → 拒绝准入', async () => {
    const codes = new Map<string, InviteCode>();
    const service = await createService(codes);
    const result = await service.verifyAndAdmit('');
    expect(result.admitted).toBe(false);
    expect(result.reason).toContain('输入');
  });

  it('验证成功后 usedCount 自增', async () => {
    const codes = new Map<string, InviteCode>();
    codes.set('once', {
      code: 'once',
      createdAt: new Date().toISOString(),
      maxUses: 10,
      usedCount: 0,
    });
    const service = await createService(codes);
    await service.verifyAndAdmit('once');
    const check = codes.get('once');
    expect(check?.usedCount).toBe(1);
  });
});
