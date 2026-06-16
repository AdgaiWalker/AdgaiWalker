/**
 * Admin 认证 — isAdmin 判定（读统一 walker-session cookie + role=admin）
 *
 * 站主现在是一个 role=admin 的账号，登录走 /api/auth/login（账号会话，见 account-auth）。
 * 本文件只保留 isAdmin() 同步判定，供 30+ admin gate 调用；签名密钥走 COOKIE_SECRET。
 *
 * 旧的 ADMIN_PASSWORD 登录密码 + walker-admin cookie 已退役（owner 走账号系统，
 * ADMIN_PASSWORD 降级为 owner 账号一次性 bootstrap 密钥，见 account.service.bootstrapOwner）。
 * 不写兼容代码：旧的 signToken / authCookie / clearCookie 不再导出。
 */
import { readSessionPayload } from './account-auth';

/** 同步判定当前请求是否为站主（cookie-only，读 walker-session + role=admin，无需 Redis） */
export function isAdmin(request: Request): boolean {
  return readSessionPayload(request)?.role === 'admin';
}
