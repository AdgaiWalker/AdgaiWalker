import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('K6 completes a fresh SQLite migration and backup restore drill', () => {
  const result = spawnSync('pnpm', ['verify:deploy', '--drill'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /K6 隔离演练通过/);
});
