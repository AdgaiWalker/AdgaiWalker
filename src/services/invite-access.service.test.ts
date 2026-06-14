/**
 * InviteAccessService TDD — 邀请码验证 + invited 会话建立
 *
 * 测试约束：
 * 1. 有效邀请码 → admitted + sessionId + inviteCodeHash，并建立会话
 * 2. 无效邀请码 → 拒绝，不创建会话
 * 3. 已用完邀请码 → 拒绝
 * 4. 空码 / 格式错误 → 拒绝
 * 5. 验证成功后 usedCount 自增
 */

import { describe, it, expect } from 'vitest';
import type {
  InviteCode,
  InviteCodeRepositoryPort,
  InvitedSession,
  InvitedSessionRepositoryPort,
} from '@/stores/ports';

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

function createFakeSessionStore(sessions: Map<string, InvitedSession>): InvitedSessionRepositoryPort {
  return {
    async create(session) { sessions.set(session.sessionId, session); },
    async get(sessionId) { return sessions.get(sessionId) ?? null; },
    async isValid(sessionId) {
      const s = sessions.get(sessionId);
      return Boolean(s && s.authState === 'invited' && new Date(s.expiresAt).getTime() > Date.now());
    },
    async revoke(sessionId) { sessions.delete(sessionId); },
  };
}

async function createService(codes: Map<string, InviteCode>, sessions: Map<string, InvitedSession>) {
  const { createInviteAccessService } = await import('@/services/invite-access.service');
  return createInviteAccessService({
    inviteCodeStore: createFakeInviteCodeStore(codes),
    sessionStore: createFakeSessionStore(sessions),
  });
}

describe('InviteAccessService — 邀请码验证 + 会话建立', () => {
  it('有效邀请码 → 准入并建立 invited 会话', async () => {
    const codes = new Map<string, InviteCode>();
    const sessions = new Map<string, InvitedSession>();
    codes.set('alpha-001', {
      code: 'alpha-001', createdAt: new Date().toISOString(),
      maxUses: 10, usedCount: 0, label: '内测',
    });
    const service = await createService(codes, sessions);
    const result = await service.verifyAndAdmit('alpha-001');

    expect(result.admitted).toBe(true);
    expect(result.sessionId).toBeTruthy();
    expect(result.inviteCodeHash).toBeTruthy();

    const sessionId = result.sessionId!;
    expect(sessions.has(sessionId)).toBe(true);
    expect(sessions.get(sessionId)?.authState).toBe('invited');
  });

  it('无效邀请码 → 拒绝且不创建会话', async () => {
    const codes = new Map<string, InviteCode>();
    const sessions = new Map<string, InvitedSession>();
    const service = await createService(codes, sessions);
    const result = await service.verifyAndAdmit('nonexistent-code');

    expect(result.admitted).toBe(false);
    expect(result.reason).toContain('无效');
    expect(sessions.size).toBe(0);
  });

  it('已用完邀请码 → 拒绝', async () => {
    const codes = new Map<string, InviteCode>();
    const sessions = new Map<string, InvitedSession>();
    codes.set('exhausted', {
      code: 'exhausted', createdAt: new Date().toISOString(),
      maxUses: 2, usedCount: 2,
    });
    const service = await createService(codes, sessions);
    const result = await service.verifyAndAdmit('exhausted');

    expect(result.admitted).toBe(false);
    expect(result.reason).toContain('已用完');
  });

  it('空码 → 拒绝', async () => {
    const codes = new Map<string, InviteCode>();
    const sessions = new Map<string, InvitedSession>();
    const service = await createService(codes, sessions);
    const result = await service.verifyAndAdmit('');

    expect(result.admitted).toBe(false);
    expect(result.reason).toContain('输入');
  });

  it('验证成功后 usedCount 自增', async () => {
    const codes = new Map<string, InviteCode>();
    const sessions = new Map<string, InvitedSession>();
    codes.set('once', {
      code: 'once', createdAt: new Date().toISOString(),
      maxUses: 10, usedCount: 0,
    });
    const service = await createService(codes, sessions);
    await service.verifyAndAdmit('once');
    expect(codes.get('once')?.usedCount).toBe(1);
  });
});
