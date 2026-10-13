/** SQLite 数据库入口。现有库必须显式 baseline，后续只通过迁移部署。 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'apps/api');
const prismaDir = path.join(apiDir, 'prisma');
const schema = path.join(prismaDir, 'schema.prisma');
const migrations = path.join(prismaDir, 'migrations');
const baseline = '20260922000000_sqlite_baseline';

function loadApiEnv(): void {
  const envPath = path.join(apiDir, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function databasePath(): string {
  if (process.env.WALKER_DB_PROVIDER && process.env.WALKER_DB_PROVIDER !== 'sqlite') {
    throw new Error('新开发仅支持 SQLite；WALKER_DB_PROVIDER 必须为 sqlite');
  }
  const url = process.env.DATABASE_URL?.trim();
  if (!url?.startsWith('file:')) throw new Error('DATABASE_URL 必须是 file: 开头的绝对 SQLite 路径');
  const file = url.slice(5);
  if (!path.isAbsolute(file) || /[?#]/.test(file)) {
    throw new Error('DATABASE_URL 必须指向绝对 SQLite 文件，不能带查询参数');
  }
  return file;
}

function prisma(args: string[], quiet = false): number {
  const result = spawnSync('pnpm', ['exec', 'prisma', ...args], {
    cwd: apiDir,
    env: process.env,
    encoding: 'utf8',
    stdio: quiet ? 'pipe' : 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (quiet && result.status !== 0 && result.status !== 2) {
    process.stderr.write(result.stderr || result.stdout || 'Prisma 检查失败\n');
  }
  return result.status ?? 1;
}

function requireSameSchema(args: string[], context: string): void {
  const code = prisma(['migrate', 'diff', ...args, '--exit-code'], true);
  if (code !== 0) throw new Error(`${context}与迁移历史不一致（Prisma diff exit ${code}），拒绝修改数据库`);
}

function migrationNames(): string[] {
  return fs.readdirSync(migrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(migrations, entry.name, 'migration.sql')))
    .map((entry) => entry.name).sort();
}

type MigrationRow = {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

async function databaseObjects(): Promise<{ names: string[]; rows: MigrationRow[] }> {
  const requireApi = createRequire(path.join(apiDir, 'package.json'));
  const { PrismaClient } = requireApi('@prisma/client');
  const client = new PrismaClient();
  try {
    const integrity = await client.$queryRawUnsafe('PRAGMA integrity_check') as Array<{ integrity_check: string }>;
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
      throw new Error('SQLite integrity_check 未通过');
    }
    const foreignKeyErrors = await client.$queryRawUnsafe('PRAGMA foreign_key_check') as unknown[];
    if (foreignKeyErrors.length) throw new Error('SQLite 存在失效外键，拒绝修改数据库');
    const objects = await client.$queryRawUnsafe(
      "SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
    ) as Array<{ name: string; type: string }>;
    if (objects.some((object) => object.type === 'view' || object.type === 'trigger')) {
      throw new Error('数据库包含未纳入 Prisma schema 的视图或触发器，拒绝自动迁移');
    }
    const names = objects.filter((object) => object.type === 'table').map((object) => object.name);
    if (names.includes('AuditRecord')) {
      const duplicates = await client.$queryRawUnsafe(`
        SELECT action, targetType, COUNT(*) AS count
        FROM (
          SELECT action, targetType, requestId, COUNT(*) AS n
          FROM AuditRecord
          WHERE requestId IS NOT NULL
          GROUP BY action, targetType, requestId
          HAVING n > 1
        )
        GROUP BY action, targetType
        LIMIT 5
      `) as Array<{ action: string; targetType: string; count: bigint }>;
      if (duplicates.length > 0) {
        const groups = duplicates.map((row) => `${row.action}/${row.targetType}: ${row.count}`).join('；');
        throw new Error(`AuditRecord 存在重复的非空请求键，拒绝迁移；请人工核对重复组：${groups}`);
      }
    }
    const rows = names.includes('_prisma_migrations')
      ? await client.$queryRawUnsafe(
          'SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at',
        ) as MigrationRow[]
      : [];
    return { names, rows };
  } finally {
    await client.$disconnect();
  }
}

function verifyHistory(names: string[], rows: MigrationRow[]): void {
  if (!rows.length) throw new Error('迁移标记表为空，拒绝猜测历史状态');
  if (rows.length > names.length) throw new Error('数据库存在未知迁移');
  rows.forEach((row, index) => {
    if (row.migration_name !== names[index] || !row.finished_at || row.rolled_back_at) {
      throw new Error('数据库迁移历史未知、失败或不连续');
    }
    const sql = fs.readFileSync(path.join(migrations, row.migration_name, 'migration.sql'));
    if (createHash('sha256').update(sql).digest('hex') !== row.checksum) {
      throw new Error(`迁移文件已改变：${row.migration_name}`);
    }
  });
}

function withMigrationSnapshot(names: string[], action: (dir: string, shadowUrl: string) => void): void {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-prisma-check-'));
  try {
    const subset = path.join(temp, 'migrations');
    fs.mkdirSync(subset);
    fs.copyFileSync(path.join(migrations, 'migration_lock.toml'), path.join(subset, 'migration_lock.toml'));
    for (const name of names) fs.cpSync(path.join(migrations, name), path.join(subset, name), { recursive: true });
    action(subset, `file:${path.join(temp, 'shadow.db')}`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function verifyMigrationSource(names: string[]): void {
  withMigrationSnapshot(names, (subset, shadowUrl) => {
    requireSameSchema([
      '--from-migrations', subset,
      '--to-schema-datamodel', schema,
      '--shadow-database-url', shadowUrl,
    ], '当前 schema ');
  });
}

function verifyCurrentDatabase(names: string[], dbUrl: string): void {
  withMigrationSnapshot(names, (subset, shadowUrl) => {
    requireSameSchema([
      '--from-migrations', subset,
      '--to-url', dbUrl,
      '--shadow-database-url', shadowUrl,
    ], '数据库 schema ');
  });
}

async function main(): Promise<void> {
  loadApiEnv();
  const command = process.argv[2] ?? 'generate';
  const file = databasePath();
  const dbUrl = `file:${file}`;
  process.env.DATABASE_URL = dbUrl;
  if (command === 'generate') {
    if (prisma(['generate', `--schema=${schema}`]) !== 0) process.exitCode = 1;
    return;
  }
  if (command !== 'baseline' && command !== 'migrate') {
    throw new Error(`未知数据库命令：${command}（支持 generate|baseline|migrate）`);
  }
  const names = migrationNames();
  if (names[0] !== baseline) throw new Error('SQLite 基线迁移缺失');
  verifyMigrationSource(names);
  const exists = fs.existsSync(file);
  if (exists && !fs.statSync(file).isFile()) throw new Error('DATABASE_URL 不是普通文件');
  if (!exists) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Prisma 6 的 SQLite schema engine 不能从不存在的文件启动迁移。
    fs.closeSync(fs.openSync(file, 'wx'));
  }
  const { names: objects, rows } = exists && fs.statSync(file).size > 0
    ? await databaseObjects()
    : { names: [], rows: [] };

  if (objects.includes('_prisma_migrations')) {
    verifyHistory(names, rows);
    verifyCurrentDatabase(names.slice(0, rows.length), dbUrl);
  } else if (objects.length > 0) {
    if (command !== 'baseline') throw new Error('现有 SQLite 库尚未建立基线；先运行 pnpm db:baseline');
    verifyCurrentDatabase([baseline], dbUrl);
    if (prisma(['migrate', 'resolve', '--applied', baseline, `--schema=${schema}`]) !== 0) {
      throw new Error('SQLite 基线标记失败');
    }
  }

  if (prisma(['migrate', 'deploy', `--schema=${schema}`]) !== 0) {
    throw new Error('SQLite 迁移部署失败');
  }
  requireSameSchema(['--from-url', dbUrl, '--to-schema-datamodel', schema], '部署后的数据库 schema ');
  console.log(`[prisma-env] ${command} 完成：${file}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
