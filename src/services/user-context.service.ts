/**
 * 用户上下文服务 — 汇总 authState、session、username、profile
 *
 * HTTP 层判断 admin cookie（isAdmin）并读取账号会话 sessionId，
 * 交给本服务确认会话有效性、拉取画像，产出统一 UserContext。
 *
 * 认证状态判定：
 * - isAdmin → 'admin'（sessionId/username/profile 均置 null）
 * - 无 sessionId / 会话失效 / 过期 / 账号不存在 / status !== 'active' → 'public'
 * - 否则 → 'user'，带 sessionId + username + profile
 *
 * banned / deleteRequested 账号视为未认证（不暴露登录态），强制走 public 路径。
 */

import type { UserContext, UserContextServicePort } from './interfaces';
import type {
  AccountRepositoryPort,
  SessionRepositoryPort,
  UserProfileRepositoryPort,
} from '@/stores/ports';

export function createUserContextService(deps: {
  sessionStore: SessionRepositoryPort;
  accountStore: AccountRepositoryPort;
  profileStore: UserProfileRepositoryPort;
}): UserContextServicePort {
  const PUBLIC_CONTEXT: UserContext = {
    authState: 'public',
    sessionId: null,
    username: null,
    profile: null,
  };

  return {
    async resolve({ sessionId, isAdmin }): Promise<UserContext> {
      if (isAdmin) {
        return { authState: 'admin', sessionId: null, username: null, profile: null };
      }
      if (!sessionId) {
        return PUBLIC_CONTEXT;
      }

      const session = await deps.sessionStore.get(sessionId);
      if (!session) {
        return PUBLIC_CONTEXT;
      }
      // 过期：expiresAt <= now
      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        return PUBLIC_CONTEXT;
      }

      const account = await deps.accountStore.findByUsername(session.username);
      if (!account || account.status !== 'active') {
        // 账号被封禁 / 已申请删除 / 不存在 → 视为未认证
        return PUBLIC_CONTEXT;
      }

      const profile = await deps.profileStore.findByUsername(session.username);
      return {
        authState: 'user',
        sessionId,
        username: session.username,
        profile,
      };
    },
  };
}
