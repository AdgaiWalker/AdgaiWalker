/**
 * accept-http — 验收用 JSON fetch / curl intake
 * 依赖：node:child_process
 * 被调用：accept-dual-entry
 */
import { spawnSync } from 'node:child_process';

export async function fetchJson(
  url: string,
  init: RequestInit = {},
): Promise<{ res: Response; body: Record<string, unknown> | null }> {
  const res = await fetch(url, init);
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  return { res, body };
}

export function curlJsonWithCookie(
  apiBase: string,
  jarPath: string,
  body: unknown,
): { httpCode: string; body: Record<string, unknown>; raw: string } {
  const r = spawnSync(
    'curl',
    [
      '-s',
      '-c',
      jarPath,
      '-b',
      jarPath,
      '-H',
      'Content-Type: application/json',
      '-d',
      JSON.stringify(body),
      '-w',
      '\n%{http_code}',
      `${apiBase}/intake`,
    ],
    { encoding: 'utf8' },
  );
  const raw = r.stdout || '';
  const lines = raw.trim().split('\n');
  const httpCode = lines.pop() || '';
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(lines.join('\n')) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  return { httpCode, body: parsed, raw };
}
