/**
 * 基线导入（V03）：把可信构建产出的 public-manifest.json 发布为已核验公开快照。
 *
 * 用法：
 *   pnpm snapshot:import -- --from apps/web/src/generated/public-manifest.json
 *   WALKER_PUBLIC_SNAPSHOT_DIR=/abs/dir pnpm snapshot:import
 *
 * 只接受 hash 自洽的 manifest（逐条 hash、集合 hash、buildId 三处一致），
 * 发布走 V02 仓储的原子写入与指针切换，导入后回读核对；失败不留下半个基线。
 * 不输出正文与密钥，只打印集合 hash 与条目数。
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPublicSnapshot, type PublicSnapshotManifest } from '@walker/shared';
import { FsPublicSnapshotRepository } from '../apps/api/src/adapters/fs-public-snapshot.repository';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const from = path.resolve(argValue('--from') ?? path.join(repoRoot, 'apps/web/src/generated/public-manifest.json'));
  const rootDir = path.resolve(
    argValue('--root') ?? process.env.WALKER_PUBLIC_SNAPSHOT_DIR ?? path.join(repoRoot, 'apps/api/data/public-snapshots'),
  );

  if (!fs.existsSync(from)) {
    console.error(`✗ 找不到 manifest：${from}（先跑 pnpm content:gen 或从可信构建取得）`);
    process.exit(1);
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(from, 'utf8'));
  } catch {
    console.error(`✗ manifest 不是合法 JSON：${from}`);
    process.exit(1);
  }
  if (!verifyPublicSnapshot(manifest, sha)) {
    console.error('✗ manifest hash 不自洽，拒绝作为基线导入（可能损坏或被改动）');
    process.exit(1);
  }

  const verifiedManifest = manifest as PublicSnapshotManifest;
  // Hash self-consistency does not prove publication. The active public site serves
  // the manifest embedded in its deployed build; require an exact build match.
  const deployedUrl = argValue('--deployed-url') ?? 'https://www.iwalk.pro/public-manifest.json';
  if (!deployedUrl.startsWith('https://')) {
    console.error('✗ 已部署清单地址必须使用 HTTPS');
    process.exit(1);
  }
  try {
    const response = await fetch(deployedUrl, { signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const deployed: unknown = await response.json();
    if (!verifyPublicSnapshot(deployed, sha) ||
        (deployed as PublicSnapshotManifest).collectionHash !== verifiedManifest.collectionHash) {
      throw new Error('本地清单与已部署构建不一致');
    }
  } catch (error) {
    console.error(`✗ 无法证实清单来自已部署构建：${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
  const repo = new FsPublicSnapshotRepository(rootDir);
  await repo
    .publish(verifiedManifest)
    .then(async () => {
      const active = await repo.readActive();
      if (active.collectionHash !== verifiedManifest.collectionHash) {
        console.error('✗ 回读核对失败：激活快照与导入集合 hash 不一致');
        process.exit(1);
      }
      console.log(`✓ 基线已导入并激活：${active.collectionHash.slice(0, 12)}…（${active.items.length} 条公开条目）→ ${rootDir}`);
    })
    .catch((error: unknown) => {
      console.error(`✗ 发布失败：${error instanceof Error ? error.message : error}`);
      process.exit(1);
    });
}

void main();
