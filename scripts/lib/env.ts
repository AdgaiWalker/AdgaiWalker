/**
 * env — 本地 .env 加载
 * 依赖：node:fs
 * 被调用：accept-* 等脚本
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
