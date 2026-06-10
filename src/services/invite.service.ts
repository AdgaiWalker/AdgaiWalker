/**
 * 邀请服务 — 邀请码验证 + 准入
 */

import type { InviteServicePort, InviteVerifyResult } from './interfaces';
import type { InviteCodeRepositoryPort } from '@/stores/ports';

export function createInviteService(deps: {
  inviteCodeStore: InviteCodeRepositoryPort;
}): InviteServicePort {
  return {
    async verifyAndAdmit(code: string): Promise<InviteVerifyResult> {
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
      return { admitted: true, code: trimmed };
    },
  };
}
