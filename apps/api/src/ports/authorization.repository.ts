import type { AuthorizationGrantState, AuthorizationGrantView } from '@walker/shared';
export const AUTHORIZATION_REPOSITORY = Symbol('AUTHORIZATION_REPOSITORY');

/**
 * 读回来的一律是**带已用量的读视图**（`AuthorizationGrantState`）。
 *
 * 调用方判断"这条授权还能不能跑"必须看已用量；只回 runLimit 会让每个调用点
 * 各自猜一遍，实测就是猜错了（三条用满的授权被反复当成可用授权）。
 */
export interface AuthorizationRepositoryPort {
  create(grant: AuthorizationGrantView): Promise<AuthorizationGrantState>;
  find(id: string): Promise<AuthorizationGrantState | null>;
  revoke(id: string, now: Date): Promise<boolean>;
  list(agentId: string): Promise<AuthorizationGrantState[]>;
}
