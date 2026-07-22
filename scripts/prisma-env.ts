/**
 * Prisma 提供方选择
 * 职责：按 WALKER_DB_PROVIDER / DATABASE_URL 选 schema，跑 generate 或 push/migrate。
 *
 * 依赖：子进程 prisma CLI
 * 触发：pnpm db:generate / db:push / db:migrate
 * 实现：sqlite → schema.prisma + db push；postgresql → schema.postgresql.prisma + migrate
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'apps/api');
const prismaDir = path.join(apiDir, 'prisma');

function loadApiEnv(): void {
  const envPath = path.join(apiDir, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

export type DbProvider = 'sqlite' | 'postgresql';

export function resolveDbProvider(): DbProvider {
  const forced = process.env.WALKER_DB_PROVIDER?.trim().toLowerCase();
  if (forced === 'sqlite' || forced === 'postgresql') return forced;
  const url = process.env.DATABASE_URL?.trim() ?? '';
  if (url.startsWith('file:')) return 'sqlite';
  if (url.startsWith('postgresql:') || url.startsWith('postgres:')) {
    return 'postgresql';
  }
  return 'sqlite';
}

export function schemaPath(provider: DbProvider): string {
  return provider === 'postgresql'
    ? path.join(prismaDir, 'schema.postgresql.prisma')
    : path.join(prismaDir, 'schema.prisma');
}

function runPrisma(args: string[]): number {
  const r = spawnSync('pnpm', ['exec', 'prisma', ...args], {
    cwd: apiDir,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
  return r.status ?? 1;
}

function main(): void {
  loadApiEnv();
  const cmd = process.argv[2] ?? 'generate';
  const provider = resolveDbProvider();
  const schema = schemaPath(provider);

  if (!fs.existsSync(schema)) {
    console.error(`missing schema: ${schema}`);
    process.exit(1);
  }

  // sqlite 默认 DATABASE_URL
  if (provider === 'sqlite' && !process.env.DATABASE_URL) {
    const dbFile = path.join(apiDir, 'data', 'walker.db');
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    process.env.DATABASE_URL = `file:${dbFile}`;
  }

  console.log(`[prisma-env] provider=${provider} cmd=${cmd}`);
  console.log(`[prisma-env] DATABASE_URL=${process.env.DATABASE_URL ?? '(unset)'}`);

  if (cmd === 'generate') {
    process.exit(runPrisma(['generate', `--schema=${schema}`]));
  }

  if (cmd === 'push') {
    if (provider !== 'sqlite') {
      console.error('db push 仅用于 sqlite 本地；PG 请用 migrate deploy');
      process.exit(1);
    }
    process.exit(runPrisma(['db', 'push', `--schema=${schema}`]));
  }

  if (cmd === 'migrate' || cmd === 'deploy') {
    if (provider !== 'postgresql') {
      console.error('migrate 仅用于 postgresql；sqlite 请用 pnpm db:push');
      process.exit(1);
    }
    process.exit(
      runPrisma(['migrate', 'deploy', `--schema=${schema}`]),
    );
  }

  console.error(`unknown cmd: ${cmd} (generate|push|migrate)`);
  process.exit(1);
}

main();
