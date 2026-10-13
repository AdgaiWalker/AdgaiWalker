/**
 * G01 旧数据导入与兼容读演练脚本（TECH-DESIGN §14）
 *
 * 用法：
 *   pnpm exec tsx scripts/migrate-legacy-data.ts [--actor <name>]
 *
 * 保证：
 *   1. 幂等：重复执行新增行数恒为 0；
 *   2. 旧表保全：AgentRun/SkillRun/AssistantRun 只读保留；
 *   3. 诚实未知：无法恢复的修订/用量保持 null。
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { migrateLegacyData } from '../apps/api/src/migration/legacy-data-migration.core';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(repoRoot, 'apps/api');
const requireApi = createRequire(path.join(apiDir, 'package.json'));
const { PrismaClient } = requireApi('@prisma/client');

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  loadApiEnv();
  const actor = argValue('--actor') ?? 'cli-migration-job';

  const db = new PrismaClient();
  try {
    const result = await migrateLegacyData(db, { idFactory: () => randomUUID(), actor });
    console.log(JSON.stringify(result, null, 2));
    console.log(
      `✓ 导入完成 (耗时 ${result.durationMs}ms)：生成初始修订 ${result.revisionsCreated} 条，迁移 AgentRun ${result.agentRunsMigrated} 条，迁移 SkillRun ${result.skillRunsMigrated} 条，迁移 AssistantRun ${result.assistantRunsMigrated} 条，补齐会话资源索引 ${result.conversationResourcesIndexed} 条`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error('✗ 迁移执行失败：', err);
  process.exit(1);
});
