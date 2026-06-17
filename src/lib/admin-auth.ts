/**
 * Admin 认证 — isAdmin / isOwner 判定（读统一 walker-session cookie 的 role）
 *
 * role=admin（管理员）或 role=owner（站主）都有后台权限（isAdmin）；只有 owner 能指派角色（isOwner）。
 * 纯 cookie 同步判定，供 30+ admin gate 调用，无需 Redis；签名密钥走 COOKIE_SECRET。
 */
import { readSessionPayload } from './account-auth';

/** 同步判定当前请求是否有后台权限（cookie-only：role=admin 或 owner） */
export function isAdmin(request: Request): boolean {
  const role = readSessionPayload(request)?.role;
  return role === 'admin' || role === 'owner';
}

/** 同步判定当前请求是否为站主（role=owner）——只有 owner 能指派角色 */
export function isOwner(request: Request): boolean {
  return readSessionPayload(request)?.role === 'owner';
}
