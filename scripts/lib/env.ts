/**
 * env — 本地 .env 加载与 ADMIN_API_TOKEN 解析
 * 依赖：node:fs、paths
 * 被调用：accept-*（不打印密钥值）
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { apiEnvPath } from './paths';

export function loadLocalEnv(relPath = '.env'): { loaded: boolean; keys: string[] } {
  const envPath = resolve(process.cwd(), relPath);
  if (!existsSync(envPath)) return { loaded: false, keys: [] };

  const keys: string[] = [];
  const content = readFileSync(envPath, 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    if (process.env[key] !== undefined) continue;

    process.env[key] = parseEnvValue(match[2]);
    keys.push(key);
  }

  return { loaded: true, keys };
}

function parseEnvValue(rawValue: string): string {
  let value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
}

/** 优先 process.env，否则读 apps/api/.env 中的 ADMIN_API_TOKEN */
export function loadAdminToken(): string {
  if (process.env.ADMIN_API_TOKEN) return process.env.ADMIN_API_TOKEN;
  if (!existsSync(apiEnvPath)) return '';
  const line = readFileSync(apiEnvPath, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('ADMIN_API_TOKEN='));
  return line ? line.slice('ADMIN_API_TOKEN='.length).trim() : '';
}
