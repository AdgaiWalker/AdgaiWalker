import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadLocalEnv } from '../../scripts/load-local-env.mjs';

const touchedKeys = [
  'WALKER_TEST_ENV_PLAIN',
  'WALKER_TEST_ENV_QUOTED',
  'WALKER_TEST_ENV_EXPORTED',
  'WALKER_TEST_ENV_EXISTING',
  'WALKER_TEST_ENV_MULTILINE',
];

let previousCwd = process.cwd();
let tempDirs: string[] = [];

afterEach(() => {
  process.chdir(previousCwd);
  for (const key of touchedKeys) {
    delete process.env[key];
  }
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe('loadLocalEnv', () => {
  it('读取仓库本地 env 文件，支持 quoted/export，并忽略注释和坏行', () => {
    const dir = makeTempDir();
    process.chdir(dir);
    writeFileSync(join(dir, '.env'), [
      '# comment',
      'WALKER_TEST_ENV_PLAIN=plain-value',
      'WALKER_TEST_ENV_QUOTED="quoted value"',
      'export WALKER_TEST_ENV_EXPORTED=exported-value',
      'bad line without equals',
      'WALKER_TEST_ENV_MULTILINE=line\\nnext',
      '',
    ].join('\n'));

    const result = loadLocalEnv();

    expect(result.loaded).toBe(true);
    expect(result.keys).toEqual([
      'WALKER_TEST_ENV_PLAIN',
      'WALKER_TEST_ENV_QUOTED',
      'WALKER_TEST_ENV_EXPORTED',
      'WALKER_TEST_ENV_MULTILINE',
    ]);
    expect(process.env.WALKER_TEST_ENV_PLAIN).toBe('plain-value');
    expect(process.env.WALKER_TEST_ENV_QUOTED).toBe('quoted value');
    expect(process.env.WALKER_TEST_ENV_EXPORTED).toBe('exported-value');
    expect(process.env.WALKER_TEST_ENV_MULTILINE).toBe('line\nnext');
  });

  it('不覆盖平台或 shell 已注入的环境变量', () => {
    const dir = makeTempDir();
    process.chdir(dir);
    process.env.WALKER_TEST_ENV_EXISTING = 'from-shell';
    writeFileSync(join(dir, '.env'), 'WALKER_TEST_ENV_EXISTING=from-dotenv\n');

    const result = loadLocalEnv();

    expect(result.loaded).toBe(true);
    expect(result.keys).toEqual([]);
    expect(process.env.WALKER_TEST_ENV_EXISTING).toBe('from-shell');
  });

  it('缺少 env 文件时安全返回空结果', () => {
    const dir = makeTempDir();
    process.chdir(dir);

    const result = loadLocalEnv();

    expect(result).toEqual({ loaded: false, keys: [] });
  });
});

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'walker-env-test-'));
  tempDirs.push(dir);
  return dir;
}
