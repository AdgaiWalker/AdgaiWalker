/**
 * 用户上下文服务 — 汇总 authState、session、profile
 *
 * HTTP 层判断 admin cookie（isAdmin）并读取 invited sessionId，
 * 交给本服务确认会话有效性、拉取画像，产出统一 UserContext。
 */

import type { UserContext, UserContextServicePort } from './interfaces';
import type { InvitedSessionRepositoryPort, UserProfileRepositoryPort } from '@/stores/ports';

export function createUserContextService(deps: {
  sessionStore: InvitedSessionRepositoryPort;
  profileStore: UserProfileRepositoryPort;
}): UserContextServicePort {
  return {
    async resolve({ sessionId, isAdmin }): Promise<UserContext> {
      if (isAdmin) {
        return { authState: 'admin', sessionId: null, profile: null };
      }
      if (!sessionId) {
        return { authState: 'public', sessionId: null, profile: null };
      }

      const valid = await deps.sessionStore.isValid(sessionId);
      if (!valid) {
        return { authState: 'public', sessionId: null, profile: null };
      }

      const profile = await deps.profileStore.findBySessionId(sessionId);
      return { authState: 'invited', sessionId, profile };
    },
  };
}
