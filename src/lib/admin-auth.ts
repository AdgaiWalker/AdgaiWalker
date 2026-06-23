/**
 * Admin 认证 — isAdmin / isOwner 判定（读统一 walker-session cookie 的 role）
 *
 * role=admin（管理员）或 role=owner（站主）都有后台权限（isAdmin）；只有 owner 能指派角色（isOwner）。
 * 同步版纯 cookie 判定，供 30+ admin gate 与 UI 降级显示用，无需 Redis；签名密钥走 COOKIE_SECRET。
 *
 * 异步版（isAdminAsync / isOwnerAsync）在 cookie 签名校验之上，再向 sessionStore.isValid
 * 确认会话未被 killAllByUsername 撤销（封号/改密/重置即时生效）——生产 admin gate 必须用异步版。
 */
import type { SessionRepositoryPort } from '@/stores/ports';
import { readSessionPayload } from './account-auth';
import { getRedis } from '@/stores/redis-client';

/** 同步判定当前请求是否有后台权限（cookie-only：role=admin 或 owner） */
export function isAdmin(request: Request): boolean {
  const role = readSessionPayload(request)?.role;
  return role === 'admin' || role === 'owner';
}

/** 同步判定当前请求是否为站主（role=owner）——只有 owner 能指派角色 */
export function isOwner(request: Request): boolean {
  return readSessionPayload(request)?.role === 'owner';
}

/**
 * DEV 模式无 Redis 时，dev server 重启 / HMR 热重载会清空内存会话 Map，
 * 但浏览器 cookie 仍在（30 天 Max-Age）。此时签名 cookie 通过即放行，
 * 避免本地开发每次重启都要重新登录。生产环境仍走 Redis 会话校验。
 */
function devFallback(): boolean {
  return import.meta.env.DEV && import.meta.env.MODE !== 'test' && !getRedis();
}

/** 异步判定后台权限：cookie 签名通过 + role=admin/owner + 会话未被撤销 */
export async function isAdminAsync(
  request: Request,
  sessionStore: SessionRepositoryPort,
): Promise<boolean> {
  const payload = readSessionPayload(request);
  if (!payload) return false;
  if (payload.role !== 'admin' && payload.role !== 'owner') return false;
  if (await sessionStore.isValid(payload.sid)) return true;
  return devFallback();
}

/** 异步判定站主：cookie 签名通过 + role=owner + 会话未被撤销 */
export async function isOwnerAsync(
  request: Request,
  sessionStore: SessionRepositoryPort,
): Promise<boolean> {
  const payload = readSessionPayload(request);
  if (!payload || payload.role !== 'owner') return false;
  if (await sessionStore.isValid(payload.sid)) return true;
  return devFallback();
}
