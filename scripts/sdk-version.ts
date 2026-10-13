/**
 * sdk:version —— 检查 AdgaiWalker 锁定的 DeepSeek Harness SDK 是否有更新。
 *
 * 为什么独立成命令、且**只报告不自动改**：
 * Harness SDK 的版本与运行时是绑死的（SDK 与 dsh 必须同版本，adapter 会拒绝启动），
 * 且升级要连带处理本地补丁与真实探针验证。实测教训（2026-09-23）：改版本号不等于可用
 * ——pnpm 的 overrides/patchedDependencies 都不生效，版本一致性只能靠直接依赖钉死；
 * 一次"看起来无害"的版本调整曾让运行时完全起不来。所以：
 *
 *   sdk:version            报告 当前版本 / 上游最新 / 是否落后
 *   sdk:version --all      同时列出上游全部可用版本（升版选型用）
 *
 * 升级的正确流程（人工执行，失败可回退）：
 *   1) 改 apps/api/package.json 里全部 @deepseek-ai/* 的版本号
 *   2) pnpm install（观察 peer 冲突必须为 0）
 *   3) pnpm probe:runtime —— **必须通过**，否则回退版本号
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiPackage = path.join(root, 'apps/api/package.json');
const SHOW_ALL = process.argv.includes('--all');

/**
 * 我们直接钉死的 Harness 包，分两类：
 * - harness：`@deepseek-ai/dsh*`，与 dsh 同一条发布线（必须同版本）
 * - cordis：`@deepseek-ai/cordis*`，插件框架，各有自己的版本号（不参与同版本约束）
 */
function pinnedVersions(): { harness: Map<string, string>; cordis: Map<string, string> } {
  const pkg = JSON.parse(fs.readFileSync(apiPackage, 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const harness = new Map<string, string>();
  const cordis = new Map<string, string>();
  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
    if (!name.startsWith('@deepseek-ai/')) continue;
    if (name.startsWith('@deepseek-ai/cordis')) cordis.set(name, version);
    else if (name.startsWith('@deepseek-ai/dsh')) harness.set(name, version);
  }
  return { harness, cordis };
}

/** 调用 npm view。args 逐项传入（不走 shell），避免拼接出错。 */
function npmView(args: string[]): string {
  return execFileSync('npm', ['view', ...args, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * 上游 dist-tags。**不能只看 latest**：实测 @deepseek-ai/dsh 的 latest 指向 0.1.5-rc.2，
 * 而 next 才是 0.1.5-rc.3——只信 latest 会漏掉更新，甚至会误判"已是最新"。
 */
function distTagsFor(name: string): Record<string, string> | null {
  try {
    const raw = npmView([name, 'dist-tags']).trim();
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  } catch {
    return null;
  }
}

function allVersionsFor(name: string): string[] {
  try {
    const raw = npmView([name, 'versions']).trim();
    const parsed = JSON.parse(raw) as string[] | string;
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function main(): void {
  const { harness, cordis } = pinnedVersions();
  if (harness.size === 0) {
    console.error('✗ apps/api/package.json 里没有 @deepseek-ai/dsh* 依赖');
    process.exit(1);
  }

  // 一致性：dsh 主线包必须同版本（不同版本运行时会拒启动）
  const distinct = [...new Set(harness.values())];
  console.log(`dsh 主线包：${harness.size} 个`);
  console.log(`当前版本：${distinct.join(' / ')}${distinct.length > 1 ? '  ⚠ 版本不一致（运行时会拒启动）' : ''}`);
  console.log(`cordis 家族：${cordis.size} 个（各有独立版本号，不参与同版本约束）`);
  console.log('');

  const sample = [...harness.keys()].sort()[0] as string;
  const tags = distTagsFor(sample);
  if (!tags) {
    console.log(`上游版本查询失败（离线或包名变更）：${sample}`);
    return;
  }
  console.log(`上游 dist-tags（${sample}）：`);
  for (const [tag, version] of Object.entries(tags)) {
    const mark = distinct.includes(version) ? '  ← 我们正在用' : '';
    console.log(`  ${tag.padEnd(7)} ${version}${mark}`);
  }
  console.log('');

  // 我们是否落后：任一 tag 指向的版本都比当前新（按 semver 粗略比较字符串即可，
  // rc/alpha 阶段版本号是递增的；真正的可用性由 probe:runtime 决定，不靠这里判定）。
  const candidates = Object.entries(tags)
    .filter(([, version]) => !distinct.includes(version))
    .map(([tag, version]) => `${tag}=${version}`);
  if (candidates.length === 0) {
    console.log('→ 上游所有 tag 都是我们正在用的版本，无需动作');
  } else {
    console.log(`→ 上游还有其它版本：${candidates.join(' / ')}`);
    console.log('  升级前必须确认它真的可用（rc 阶段不能只看版本号）：');
    console.log('  1) 改 apps/api/package.json 全部 @deepseek-ai/dsh* 版本号');
    console.log('  2) pnpm install（peer 冲突必须为 0）');
    console.log('  3) pnpm probe:runtime（必须通过，否则回退）');
  }

  if (SHOW_ALL) {
    console.log('');
    console.log(`上游全部版本（${sample}）：`);
    for (const version of allVersionsFor(sample).slice(-15)) console.log(`  ${version}`);
  }
}

main();
