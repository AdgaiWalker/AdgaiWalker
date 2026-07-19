/**
 * 从 admin 请求中解析操作者身份（用于审计与 WorkItem history.actor）。
 *
 * 优先使用会话里的 username；解析失败时回退到 role（admin / owner）。
 * 不信任客户端传入的 actor 字段 —— 所有 service 调用的 actor 都由这里派生。
 */
import { readSessionPayload } from './account-auth';
import { createSessionStore } from '@/stores/session.store';

export async function resolveAdminActor(request: Request): Promise<string> {
  const payload = readSessionPayload(request);
  if (!payload) return 'anonymous';
  // 通过会话 ID 查 username（真会话有效性在 session store）
  try {
    const session = await createSessionStore().get(payload.sid);
    if (session?.username) return session.username;
  } catch {
    // 降级到 role
  }
  return payload.role;
}
