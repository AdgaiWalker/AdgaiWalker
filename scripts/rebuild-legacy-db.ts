/**
 * 旧库重建与数据搬迁（G07 生产库迁移路径）
 *
 * 用法：
 *   pnpm rebuild:legacy-db --from <旧库绝对路径> --to <新库绝对路径> --confirm
 *
 * 为什么需要它（2026-09-27 实测）：
 *   生产库既没有 _prisma_migrations 迁移历史，**也不等于基线快照**（缺 SkillRun；
 *   AgentRun 少 providerId/promptSnapshot/temperature），因此 `pnpm db:baseline` 会
 *   以「schema 与迁移历史不一致」直接拒绝；`prisma db push` 又需要 --accept-data-loss
 *   （仓库策略明令禁止）。本脚本走第三条路：**新建干净库 → 应用全部迁移 → 按列交集搬迁真实数据**，
 *   既拿到完整迁移历史，又不丢数据、不放宽任何安全标志。
 *
 * 纪律：
 *   1. 绝不覆盖已存在的目标库（--to 必须不存在）；
 *   2. 源库若已有迁移历史则拒绝（那种情况应直接用 pnpm db:migrate）；
 *   3. 只搬两库共有的表与列，源独有列如实报告（不静默丢弃数据）；
 *   4. 必须显式 --confirm 才真正执行；
 *   5. 结束后用 prisma migrate diff 证明新库与迁移目标**零差异**。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(repoRoot, 'apps/api');
const schemaPath = path.join(apiDir, 'prisma/schema.prisma');
const migrationsDir = path.join(apiDir, 'prisma/migrations');
const requireApi = createRequire(path.join(apiDir, 'package.json'));

type RawClient = {
  $executeRawUnsafe(sql: string): Promise<unknown>;
  $queryRawUnsafe(sql: string): Promise<unknown>;
  $disconnect(): Promise<void>;
};

type ForeignKeyRow = { table: string };

async function orderTablesByForeignKeys(
  target: RawClient,
  sourceTables: readonly string[],
  targetTables: ReadonlySet<string>,
): Promise<string[]> {
  const shared = new Set(sourceTables.filter((table) => targetTables.has(table)));
  const dependencies = new Map<string, string[]>();
  for (const table of shared) {
    const escaped = table.replaceAll('"', '""');
    const rows = await target.$queryRawUnsafe(`PRAGMA foreign_key_list("${escaped}")`) as ForeignKeyRow[];
    dependencies.set(table, [...new Set(rows.map((row) => row.table)
      .filter((parent) => parent !== table && shared.has(parent)))].sort());
  }
  const ordered: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (table: string) => {
    if (visited.has(table)) return;
    if (visiting.has(table)) die(`旧库表之间存在外键环，拒绝不安全搬迁：${table}`);
    visiting.add(table);
    for (const parent of dependencies.get(table) ?? []) visit(parent);
    visiting.delete(table);
    visited.add(table);
    ordered.push(table);
  };
  for (const table of [...shared].sort()) visit(table);
  return [...ordered, ...sourceTables.filter((table) => !shared.has(table))];
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function die(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function prismaEnv(args: string[], databaseUrl: string, quiet = false): number {
  const result = spawnSync('pnpm', ['exec', 'prisma', ...args], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: databaseUrl, WALKER_DB_PROVIDER: 'sqlite' },
    stdio: quiet ? 'pipe' : 'inherit',
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  return result.status ?? 1;
}

async function main(): Promise<void> {
  const from = arg('--from');
  const to = arg('--to');
  const confirmed = process.argv.includes('--confirm');

  if (!from || !to) die('必须显式指定 --from <旧库> 与 --to <新库>（均需绝对路径）');
  const fromPath = path.resolve(from);
  const toPath = path.resolve(to);
  if (fromPath === toPath) die('--from 与 --to 不能是同一个文件');
  if (!path.isAbsolute(from)) die('--from 必须是绝对路径');
  if (!path.isAbsolute(to)) die('--to 必须是绝对路径');
  if (!fs.existsSync(fromPath)) die(`源库不存在：${fromPath}`);
  if (!fs.statSync(fromPath).isFile()) die('源库不是普通文件');
  if (fs.existsSync(toPath)) die(`目标库已存在，拒绝覆盖：${toPath}（先移走或换个路径）`);
  if (!fs.existsSync(path.join(migrationsDir, 'migration_lock.toml'))) die('缺少 prisma/migrations/migration_lock.toml');
  if (!confirmed) die('这是会写文件的重建操作；确认无误后追加 --confirm 重跑');

  const migrationCount = fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).length;

  const { PrismaClient } = requireApi('@prisma/client') as {
    PrismaClient: new (options: { datasources: { db: { url: string } } }) => RawClient;
  };
  const fromUrl = `file:${fromPath}`;
  const toUrl = `file:${toPath}`;

  console.log(`源库：${fromPath}`);
  console.log(`新库：${toPath}（将新建）`);
  console.log(`迁移：${migrationCount} 个\n`);

  // 守卫：源库若已有迁移历史，说明它已经是受管库，应走 db:migrate 而不是重建
  const probe = new PrismaClient({ datasources: { db: { url: fromUrl } } });
  let sourceHasHistory = false;
  try {
    const rows = await probe.$queryRawUnsafe('SELECT count(*) AS n FROM _prisma_migrations') as Array<{ n: bigint }>;
    sourceHasHistory = Number(rows[0]?.n ?? 0) > 0;
  } catch {
    sourceHasHistory = false;
  }
  if (sourceHasHistory) {
    await probe.$disconnect();
    die('源库已有迁移历史；这种情况请直接用 pnpm db:migrate，不要重建');
  }

  // 1) 新建空库并应用全部迁移
  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  fs.closeSync(fs.openSync(toPath, 'wx'));
  console.log('— 步骤 1：应用全部迁移到新库 —');
  if (prismaEnv(['migrate', 'deploy', `--schema=${schemaPath}`], toUrl) !== 0) {
    await probe.$disconnect();
    die('新库迁移失败');
  }

  // 2) 列出源库业务表
  const sourceTables = (await probe.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations' ORDER BY name",
  ) as Array<{ name: string }>).map((row) => row.name);

  const target = new PrismaClient({ datasources: { db: { url: toUrl } } });
  const targetTables = new Set((await target.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  ) as Array<{ name: string }>).map((row) => row.name));
  const orderedTables = await orderTablesByForeignKeys(target, sourceTables, targetTables);

  const columns = async (client: RawClient, schema: string, table: string): Promise<string[]> =>
    (await client.$queryRawUnsafe(`SELECT name FROM pragma_table_info('${table}', '${schema}')`) as Array<{ name: string }>)
      .map((row) => row.name);

  console.log('\n— 步骤 2：按列交集搬迁数据 —');
  let movedRows = 0;
  const droppedTables: string[] = [];
  await target.$executeRawUnsafe(`ATTACH DATABASE '${fromPath}' AS legacy`);
  try {
    for (const table of orderedTables) {
      const sourceCount = Number((await probe.$queryRawUnsafe(`SELECT count(*) AS n FROM "${table}"`) as Array<{ n: bigint }>)[0]?.n ?? 0);
      if (!targetTables.has(table)) {
        // 目标 schema 已删除的遗留表：如实报告，不静默丢弃
        droppedTables.push(`${table}(${sourceCount} 行)`);
        continue;
      }
      if (sourceCount === 0) continue;
      const targetCols = await columns(target, 'main', table);
      const sourceCols = await columns(target, 'legacy', table);
      const shared = targetCols.filter((column) => sourceCols.includes(column));
      if (shared.length === 0) {
        droppedTables.push(`${table}(无可搬迁列)`);
        continue;
      }
      const list = shared.map((column) => `"${column}"`).join(', ');
      await target.$executeRawUnsafe(
        `INSERT INTO main."${table}" (${list}) SELECT ${list} FROM legacy."${table}"`,
      );
      const after = Number((await target.$queryRawUnsafe(`SELECT count(*) AS n FROM main."${table}"`) as Array<{ n: bigint }>)[0]?.n ?? 0);
      if (after !== sourceCount) die(`${table} 行数不一致：源 ${sourceCount} → 新 ${after}`);
      movedRows += after;
      const targetOnly = targetCols.filter((column) => !sourceCols.includes(column));
      const sourceOnly = sourceCols.filter((column) => !targetCols.includes(column));
      console.log(
        `  ${table.padEnd(24)} ${String(after).padStart(5)} 行  （列 ${shared.length}/${targetCols.length}` +
        `${targetOnly.length ? `，新表独有默认列 ${targetOnly.length}` : ''}` +
        `${sourceOnly.length ? `，**源独有未搬迁列 ${sourceOnly.length}: ${sourceOnly.join('/')}**` : ''}）`,
      );
    }
  } finally {
    await target.$executeRawUnsafe('DETACH DATABASE legacy').catch(() => undefined);
    await target.$disconnect();
    await probe.$disconnect();
  }

  // 3) 证明新库与迁移目标零差异
  console.log('\n— 步骤 3：核对新库与迁移目标 —');
  const shadow = `${toPath}.shadow`;
  const diff = prismaEnv([
    'migrate', 'diff',
    `--from-url=${toUrl}`,
    `--to-migrations=${migrationsDir}`,
    `--shadow-database-url=file:${shadow}`,
    '--exit-code',
  ], toUrl, true);
  fs.rmSync(shadow, { force: true });
  if (diff !== 0) die(`新库与迁移目标存在差异（prisma migrate diff exit ${diff}）`);

  console.log(`✓ 搬迁 ${movedRows} 行；新库与迁移目标零差异`);
  if (droppedTables.length > 0) {
    console.log(`\n注意：以下源库表在目标 schema 中已不存在，未搬迁（请确认可弃）：`);
    for (const item of droppedTables) console.log(`  - ${item}`);
  }
  console.log(`\n✓ 重建完成：${toPath}`);
  console.log('后续：把 DATABASE_URL 指向新库 → pnpm build:api → 重启 WalkerApi（旧库保留为回退副本）');
}

void main();
