/**
 * 测试库隔离：每次测试运行前重建独立 sqlite 测试库（默认 apps/api/data/walker.test.db，
 * 由 vitest.config.ts 写入 DATABASE_URL）。删除旧库 → prisma db push 重建 schema，
 * 测试互不残留。显式 API_TEST_DB_URL 也必须指向独立 SQLite .test.db 文件。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export default function setup(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.startsWith('file:') || !path.isAbsolute(url.slice(5)) || !url.endsWith('.test.db')) {
    throw new Error('拒绝重建非独立 SQLite 测试库');
  }
  const dbFile = url.slice('file:'.length);
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
  }
  // 当前 Prisma 引擎无法从不存在的 SQLite 文件初始化；先创建空文件再建表。
  fs.closeSync(fs.openSync(dbFile, 'wx'));
  const r = spawnSync(
    'pnpm',
    ['exec', 'prisma', 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate'],
    { cwd: __dirname, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if ((r.status ?? 1) !== 0) {
    throw new Error(`测试库 schema 重建失败（prisma db push exit ${r.status}）`);
  }
}
