/** 管理令牌规则（纯函数 · 无 DOM） */
/** 与 API 侧一致；过短则无法登录管理面 */
export const ADMIN_TOKEN_MIN_LENGTH = 8;

export function isValidAdminToken(token: string): boolean {
  return token.trim().length >= ADMIN_TOKEN_MIN_LENGTH;
}
