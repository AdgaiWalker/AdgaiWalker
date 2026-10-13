/**
 * G06 部署包就绪门禁（K0 合同核对 + K6 隔离演练）
 *
 * 用法：
 *   pnpm verify:deploy            # K0：核对部署包不变量
 *   pnpm verify:deploy --drill    # 追加 K6：隔离库上跑迁移/备份/回退往返
 *
 * 为什么要有这个门禁：部署清单一旦漂移（版本钉在两地、迁移缺号、能力默认被打开、
 * 公开白名单单侧改动、回退靠旧无授权写路径），问题只在生产才暴露。这里把它们变成
 * 可机器复核的断言——**失败即拒绝发版**，不靠人肉检查表。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareCaddyPublicRoutes } from '../apps/api/src/auth/public-route-contract';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'apps/api');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(root, rel));

type Check = { name: string; ok: boolean; detail: string };

/** 演练只用到这三件事，够用即可（不引入 prisma 类型依赖）。 */
type RawSqliteClient = {
  $executeRawUnsafe(sql: string): Promise<unknown>;
  $queryRawUnsafe(sql: string): Promise<unknown>;
  $disconnect(): Promise<void>;
};
const checks: Check[] = [];
const record = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

// ── 1. 版本固定：SDK / runtime 只能有一个真相源 ──────────────────────────────
const apiPkg = JSON.parse(read('apps/api/package.json')) as { dependencies: Record<string, string> };
// 只有 dsh 家族（SDK 与运行时）必须同版本；@deepseek-ai/cordis* 插件各有独立版本线，不参与比对。
const dshPins = Object.entries(apiPkg.dependencies).filter(([name]) => /^@deepseek-ai\/dsh(\b|-)/.test(name));
const versions = [...new Set(dshPins.map(([, version]) => version))];
record(
  'SDK 版本唯一（dsh 家族）',
  versions.length === 1,
  versions.length === 1 ? `${dshPins.length} 个 @deepseek-ai/dsh* 全部钉在 ${versions[0]}` : `出现多个版本：${versions.join(', ')}`,
);
const pinnedSdk = versions[0] ?? '(缺)';

const installScript = read('ops/windows/install-dsh.ps1');
record(
  '安装脚本不硬编码 SDK 版本',
  !/@deepseek-ai\/dsh@\d/.test(installScript),
  /@deepseek-ai\/dsh@\d/.test(installScript) ? 'install-dsh.ps1 仍写死版本号（会与 package.json 漂移）' : '从 apps/api/package.json 派生',
);
record(
  '安装脚本确实读取 package.json',
  installScript.includes('apps\\api\\package.json'),
  installScript.includes('apps\\api\\package.json') ? '已从 package.json 读取 dependencies' : '未发现派生逻辑',
);

const probePath = 'docs/evidence/runtime-probe.json';
if (exists(probePath)) {
  const probe = JSON.parse(read(probePath)) as { versions?: { sdk?: string; packageRuntime?: string } };
  const sdk = probe.versions?.sdk;
  record(
    '探针报告 SDK 版本与代码一致',
    sdk === pinnedSdk,
    sdk === pinnedSdk ? `探针 sdk=${sdk}` : `探针 sdk=${sdk} 与代码钉的 ${pinnedSdk} 不一致（adapter 会拒绝启动）`,
  );
} else {
  record('探针报告存在', false, `缺少 ${probePath}（G07 前必须先跑 pnpm probe:runtime）`);
}

// ── 2. 迁移清单固定：唯一、有序、含锁文件 ────────────────────────────────────
const migrationsDir = path.join(apiDir, 'prisma/migrations');
const migrations = fs.readdirSync(migrationsDir).filter((entry) => entry !== 'migration_lock.toml').sort();
const timestamps = migrations.map((name) => name.split('_')[0]!);
record(
  '迁移命名唯一且有序',
  new Set(timestamps).size === timestamps.length && timestamps.every((t, i) => i === 0 || timestamps[i - 1]! < t),
  `${migrations.length} 个迁移，最新 ${migrations[migrations.length - 1] ?? '(缺)'}`,
);
record('migration_lock.toml 存在', fs.existsSync(path.join(migrationsDir, 'migration_lock.toml')), 'Prisma 迁移锁文件');

// ── 3. 能力关闭默认值：新能力默认关，必须人工显式开启 ────────────────────────
const envExample = read('apps/api/.env.example');
record('能力默认关闭（env 模板）', /^AI_ENABLED=false$/m.test(envExample), 'AI_ENABLED=false');
const readme = read('ops/windows/README.md');
record('能力默认关闭（部署文档）', /AI_ENABLED=false/.test(readme), '部署样例 .env 里 AI_ENABLED=false');

// ── 4. content dirty 检查保留 ───────────────────────────────────────────────
const rootPkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
record('content dirty 检查脚本存在', Boolean(rootPkg.scripts['check:content-dirty']), 'pnpm check:content-dirty');
record('部署文档要求先跑 content dirty 检查', /check:content-dirty/.test(readme), '拉代码前必须先跑');

// ── 5. 持久目录不覆盖 ───────────────────────────────────────────────────────
record('备份脚本存在', exists('ops/windows/backup-walker.ps1'), 'backup-walker.ps1');
record('恢复脚本存在', exists('ops/windows/restore-walker.ps1'), 'restore-walker.ps1');
record('部署文档声明 data 不覆盖', /不得覆盖 data|不覆盖 data|data.*不得覆盖/.test(readme), 'C:\\Walker\\data 持久目录');

// ── 6. 公开双白名单保留（Nest ↔ Caddy 逐方法一致）────────────────────────────
try {
  const parity = compareCaddyPublicRoutes(read('ops/windows/Caddyfile'));
  record(
    '公开双白名单一致',
    parity.matches,
    parity.matches
      ? 'Nest exclude 与 Caddy Matcher 完全一致'
      : `Caddy 缺少 ${parity.missingFromCaddy.join(', ') || '无'}；Caddy 多出 ${parity.extraInCaddy.join(', ') || '无'}`,
  );
} catch (error) {
  record('公开双白名单一致', false, error instanceof Error ? error.message : String(error));
}

// ── 7. 回退不靠旧无授权写路径 ───────────────────────────────────────────────
record(
  '回退说明禁止旧写路径',
  /不靠旧无授权写路径|禁止.*旧.*写路径|保留人工运营/.test(readme),
  '回退优先关闭新位置/新调用/写能力，不恢复旧无版本写路径',
);

// ── 输出 ────────────────────────────────────────────────────────────────────
for (const check of checks) {
  console.log(`${check.ok ? '✓' : '✗'} ${check.name}：${check.detail}`);
}
const failed = checks.filter((check) => !check.ok);
console.log(`\n部署包就绪检查：${checks.length - failed.length}/${checks.length} 通过`);
if (failed.length > 0) {
  console.error(`✗ 部署包未就绪，先修以上 ${failed.length} 项`);
  process.exitCode = 1;
} else {
  console.log('✓ 部署包就绪（K0 通过）');
}

// ── K6 隔离演练：迁移 / 备份 / 回退往返（可选）──────────────────────────────
async function runDrill(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-g06-drill-'));
  const dbUrl = `file:${path.join(tmp, 'drill.db')}`;
  const backupPath = path.join(tmp, 'backup.db');
  const prisma = (...args: string[]) =>
    spawnSync('pnpm', ['exec', 'prisma', ...args], {
      cwd: apiDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
  try {
    console.log('\n— K6 隔离演练 —');
    // 绝对 file: SQLite URL 的目标文件须先存在；与生产重建脚本保持同一建库前置。
    fs.closeSync(fs.openSync(path.join(tmp, 'drill.db'), 'wx'));
    const deploy = prisma('migrate', 'deploy');
    if ((deploy.status ?? 1) !== 0) throw new Error('隔离库迁移失败');
    console.log(`✓ 迁移：${migrations.length} 个迁移在隔离库全部应用`);

    const { createRequire } = await import('node:module');
    const requireApi = createRequire(path.join(apiDir, 'package.json'));
    // 只用最小结构类型：scripts 的 tsconfig 解析不到 apps/api 的 node_modules，
    // 写 typeof import('@prisma/client') 会 typecheck 失败。
    const { PrismaClient } = requireApi('@prisma/client') as {
      PrismaClient: new (options: { datasources: { db: { url: string } } }) => RawSqliteClient;
    };

    // 备份：SQLite 原生快照（与 backup-walker.ps1 同思路，不是文件拷贝）
    const client = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await client.$executeRawUnsafe(`VACUUM INTO '${backupPath}'`);
    const before = (await client.$queryRawUnsafe(
      "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'",
    )) as Array<{ n: number }>;
    await client.$disconnect();
    if (!fs.existsSync(backupPath)) throw new Error('备份文件未生成');
    console.log(`✓ 备份：VACUUM INTO 生成快照（${before[0]?.n ?? 0} 张表）`);

    // 回退：删库 → 用快照恢复 → 校验表数一致
    fs.rmSync(path.join(tmp, 'drill.db'), { force: true });
    fs.copyFileSync(backupPath, path.join(tmp, 'drill.db'));
    const restored = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    const after = (await restored.$queryRawUnsafe(
      "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'",
    )) as Array<{ n: number }>;
    await restored.$disconnect();
    if ((after[0]?.n ?? 0) !== (before[0]?.n ?? -1)) throw new Error('回退后表数不一致');
    console.log(`✓ 回退：快照恢复后 ${after[0]?.n ?? 0} 张表一致，未走任何旧写入接口`);
    console.log('✓ K6 隔离演练通过（迁移 → 备份 → 回退往返）');
  } catch (error) {
    console.error(`✗ K6 隔离演练失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv.includes('--drill')) void runDrill();
