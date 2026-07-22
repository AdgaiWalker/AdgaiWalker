import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfigPort } from '../config/config.port';

/**
 * 管理面鉴权：Bearer ADMIN_API_TOKEN。
 * 未配置 token 时拒绝所有管理写/读（fail-closed，禁止裸奔）。
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfigPort) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.getAdminApiToken();
    if (!expected || expected.length < 8) {
      throw new UnauthorizedException({
        code: 'auth-not-configured',
        message: '管理令牌未配置或过短（需 ADMIN_API_TOKEN，长度≥8）',
      });
    }

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.header('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const provided = match?.[1]?.trim() ?? '';

    if (!provided || !timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException({
        code: 'unauthorized',
        message: '需要有效的管理令牌',
      });
    }
    return true;
  }
}

/** 常量时间比较，避免时序侧信道（长度不同直接 false） */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}
