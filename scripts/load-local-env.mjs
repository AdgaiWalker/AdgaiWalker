import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load local .env values for verification scripts.
 *
 * Rules:
 * - Never print values.
 * - Never override process.env values supplied by the shell / platform.
 * - Ignore comments, blank lines, and malformed lines.
 */
export function loadLocalEnv(path = '.env') {
  const envPath = resolve(process.cwd(), path);
  if (!existsSync(envPath)) return { loaded: false, keys: [] };

  const keys = [];
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

function parseEnvValue(rawValue) {
  let value = rawValue.trim();

  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}
