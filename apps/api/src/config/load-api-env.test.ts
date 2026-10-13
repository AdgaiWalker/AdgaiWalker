import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadApiEnvFile } from './load-api-env';

let root = '';

afterEach(async () => {
  vi.unstubAllEnvs();
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = '';
});

describe('loadApiEnvFile', () => {
  it('loads unset API environment values without overriding process values', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-api-env-'));
    await fs.writeFile(path.join(root, '.env'), 'DATABASE_URL="file:/tmp/walker.db"\nNODE_ENV=production\n');
    vi.stubEnv('DATABASE_URL', 'file:/already-set.db');
    vi.stubEnv('NODE_ENV', 'test');

    loadApiEnvFile(root);

    expect(process.env.DATABASE_URL).toBe('file:/already-set.db');
    expect(process.env.NODE_ENV).toBe('test');
  });
});
