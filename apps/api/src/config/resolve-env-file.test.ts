import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findApiEnvPath } from './resolve-env-file';

let root = '';

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = '';
});

describe('findApiEnvPath', () => {
  it('returns explicit customRoot if provided and exists', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-env-test-'));
    const envFile = path.join(root, '.env');
    await fs.writeFile(envFile, 'TEST=1\n');

    expect(findApiEnvPath(root)).toBe(envFile);
  });

  it('falls back when customRoot does not exist', () => {
    const res = findApiEnvPath('/non/existent/path');
    expect(res).toBeTruthy();
  });
});
