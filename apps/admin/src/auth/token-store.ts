/**
 * 管理令牌本地存储（仅浏览器；不含业务规则）。
 */
const TOKEN_KEY = 'walker-admin-api-token';

export function getAdminToken(): string {
  if (typeof localStorage === 'undefined') return '';
  return (
    localStorage.getItem(TOKEN_KEY) ||
    (import.meta.env.VITE_ADMIN_API_TOKEN as string | undefined) ||
    ''
  );
}

export function setAdminToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

export function clearAdminToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
