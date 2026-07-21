/** 管理令牌规则（纯函数 · 无 DOM） */
export const ADMIN_TOKEN_MIN_LENGTH = 16;

export function isValidAdminToken(token: string): boolean {
  return token.trim().length >= ADMIN_TOKEN_MIN_LENGTH;
}
