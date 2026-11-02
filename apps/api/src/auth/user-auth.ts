import type { Request, Response } from 'express';
import type { AuthContext, AuthTokenPayload } from '@walker/shared';
import { resolveOrSetAnonId } from './anon-cookie';

/**
 * 统一鉴权上下文提取器（阶段四挂接插槽）：
 * 优先解析 Authorization: Bearer <token>
 * 若有效则赋予已认证用户身份（actorType: 'user'）；
 * 若无或无效则平滑回退至游客匿名凭证（actorType: 'guest'，cookie 驱动）。
 */
export function resolveAuthContext(
  req: Request,
  res: Response,
  jwtVerifier?: (token: string) => AuthTokenPayload | null,
): AuthContext {
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token && jwtVerifier) {
      try {
        const payload = jwtVerifier(token);
        if (payload && payload.sub) {
          return {
            actorType: 'user',
            userId: payload.sub,
            email: payload.email,
            role: payload.role,
          };
        }
      } catch {
        // 解密或验证失败，降级为访客
      }
    }
  }

  const anonId = resolveOrSetAnonId(req.headers['cookie'], res);
  return {
    actorType: 'guest',
    anonId,
  };
}
