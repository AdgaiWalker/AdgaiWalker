import type { NextFunction, Request, Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function getAdminUsername(): string {
  return process.env.WALKER_ADMIN_USERNAME?.trim() || 'Dora';
}

export function verifyAdminPassword(candidate: string): boolean {
  const token = process.env.WALKER_ADMIN_TOKEN?.trim();
  if (!token) return true;
  return secureEqual(candidate, token);
}

export function updateAdminPassword(
  newPassword: string,
  apiRoot = path.resolve(__dirname, '../..'),
): void {
  process.env.WALKER_ADMIN_TOKEN = newPassword;
  const envFile = path.join(apiRoot, '.env');
  if (!fs.existsSync(envFile)) return;
  const content = fs.readFileSync(envFile, 'utf8');
  const lines = content.split(/\r?\n/);
  let found = false;
  const nextLines = lines.map((line) => {
    if (/^\s*WALKER_ADMIN_TOKEN\s*=/.test(line)) {
      found = true;
      return `WALKER_ADMIN_TOKEN=${newPassword}`;
    }
    return line;
  });
  if (!found) {
    nextLines.push(`WALKER_ADMIN_TOKEN=${newPassword}`);
  }
  const tmpFile = `${envFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, nextLines.join('\n'), 'utf8');
  fs.renameSync(tmpFile, envFile);
}

/**
 * 管理凭据鉴权（规则/适配层共用）
 * 职责：公网白名单之外的路由必须携带管理凭据，否则 401。
 *
 * 网络边界（Caddy 白名单 + SSH 隧道）是第一道防线，这里是第二道：
 * 即使未来配置失误把管理路由暴露出去，没有凭据也进不来。
 *
 * 凭据二选一：
 * - `x-admin-token: <password>`（前端登录时同时传 `x-admin-username: Dora` 校验账号）
 * - `Authorization: Basic ...`（Caddy basic_auth 校验后转发，浏览器自动携带；
 *   密码部分必须等于 token）
 *
 * WALKER_ADMIN_TOKEN 未配置时放行（本地开发）；
 * 生产启动时由 main.ts 强制要求配置，防止静默裸奔。
 */
export class AdminTokenMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const token = process.env.WALKER_ADMIN_TOKEN?.trim();
    if (!token) {
      next();
      return;
    }
    if (this.authorized(req, token)) {
      next();
      return;
    }
    // JSON 请求由管理端显示鉴权提示，避免浏览器原生 Basic 弹窗悬住 fetch。
    // 普通导航仍保留网关/浏览器的 Basic 认证挑战。
    if (!req.header('accept')?.includes('application/json')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="walker-admin", charset="UTF-8"');
    }
    res.status(401).json({
      code: 'admin-auth-required',
      message: '账号或密码不正确',
    });
  }

  private authorized(req: Request, token: string): boolean {
    const headerToken = req.header('x-admin-token');
    const headerUsername = req.header('x-admin-username');
    if (headerUsername !== undefined) {
      return Boolean(
        headerToken &&
          secureEqual(headerUsername, getAdminUsername()) &&
          secureEqual(headerToken, token),
      );
    }
    if (headerToken && secureEqual(headerToken, token)) {
      return true;
    }
    const basicPassword = this.basicAuthPassword(req.header('authorization'));
    if (basicPassword !== null && secureEqual(basicPassword, token)) {
      return true;
    }
    return false;
  }

  private basicAuthPassword(header: string | undefined): string | null {
    if (!header?.toLowerCase().startsWith('basic ')) return null;
    const encoded = header.slice('basic '.length).trim();
    let decoded: string;
    try {
      decoded = Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
      return null;
    }
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return decoded.slice(separator + 1);
  }
}

/** 先哈希归一化长度，再做常数时间比较 */
function secureEqual(actual: string, expected: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(actual).digest(),
    createHash('sha256').update(expected).digest(),
  );
}
