/**
 * 邀请准入服务 — 验证邀请码 + 建立 invited 会话
 *
 * 取代旧 invite.service.ts：验证通过后创建 InvitedSession，
 * 由 API 层把 sessionId 写入签名 Cookie。
 */

import { createHash } from 'node:crypto';

import { createInvitedSessionId } from '@/lib/invited-session-auth';
import type { InviteAccessServicePort, InviteAdmitResult } from './interfaces';
import type { InviteCodeRepositoryPort, InvitedSessionRepositoryPort } from '@/stores/ports';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashInviteCode(code: string): string {
  return createHash('sha256').update(code).digest('hex').slice(0, 16);
}

export function createInviteAccessService(deps: {
  inviteCodeStore: InviteCodeRepositoryPort;
  sessionStore: InvitedSessionRepositoryPort;
}): InviteAccessServicePort {
  return {
    async verifyAndAdmit(code: string): Promise<InviteAdmitResult> {
      if (!code || typeof code !== 'string') {
        return { admitted: false, reason: '请输入邀请码。' };
      }

      const trimmed = code.trim();
      if (trimmed.length < 4) {
        return { admitted: false, reason: '邀请码格式不正确。' };
      }

      const invite = await deps.inviteCodeStore.findByCode(trimmed);
      if (!invite) {
        return { admitted: false, reason: '邀请码无效。' };
      }

      if (invite.usedCount >= invite.maxUses) {
        return { admitted: false, reason: '邀请码已用完。' };
      }

      await deps.inviteCodeStore.incrementUsage(trimmed);

      const now = Date.now();
      const sessionId = createInvitedSessionId();
      await deps.sessionStore.create({
        sessionId,
        inviteCodeHash: hashInviteCode(trimmed),
        authState: 'invited',
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
      });

      return { admitted: true, sessionId, inviteCodeHash: hashInviteCode(trimmed) };
    },
  };
}
