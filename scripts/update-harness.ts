/**
 * harness:update —— 顺手把本地 DeepSeek harness 拉到最新（**不进关键路径**）。
 *
 * 为什么独立成命令而不是挂进构建：技能执行的引擎是 openai-compatible 直连，
 * harness 只是可选的重任务引擎。它的更新失败不该阻塞任何东西 —— 所以这里
 * 失败只报「更新失败 + 原因 + 当前仍可用的版本」，退出码明确，不牵连别的流程。
 *
 * 用法：
 *   pnpm harness:update            拉最新 + 装依赖 + 冒烟
 *   pnpm harness:update --dry-run  只看「本地 vs 远端」差多少，不做任何改动
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DRY_RUN = process.argv.includes('--dry-run');
const repoDir =
  process.env.DSH_RUNTIME_DIR?.trim() ||
  path.join(os.homedir(), 'Desktop/deepseek-harness');
const binPath = path.join(repoDir, 'apps/cli/src/bin.ts');

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' }).trim();
}

function run(command: string, args: string[]): void {
  execFileSync(command, args, { cwd: repoDir, stdio: 'inherit' });
}

function lockfileHash(): string {
  const lock = path.join(repoDir, 'pnpm-lock.yaml');
  if (!fs.existsSync(lock)) return '';
  return execFileSync('shasum', ['-a', '256', lock], { encoding: 'utf8' }).trim();
}

function main(): void {
  if (!fs.existsSync(repoDir)) {
    console.error(`✗ 找不到 harness 仓库：${repoDir}`);
    console.error('  用 DSH_RUNTIME_DIR 指向 clone 目录，或先 clone 一份。');
    process.exit(1);
  }
  if (!fs.existsSync(binPath)) {
    console.error(`✗ 该目录不像 harness 源码（缺 ${path.relative(repoDir, binPath)}）：${repoDir}`);
    process.exit(1);
  }

  const before = {
    head: git(['rev-parse', '--short', 'HEAD']),
    date: git(['log', '-1', '--format=%ad', '--date=short']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    dirty: git(['status', '--porcelain']) !== '',
  };
  console.log(`\nharness: ${repoDir}`);
  console.log(`  当前   ${before.head}（${before.date}，分支 ${before.branch}）`);
  if (before.dirty) {
    console.log('  注意   工作区有未提交改动，pull --ff-only 可能被拒绝');
  }

  try {
    execFileSync('git', ['fetch', '--quiet', 'origin'], { cwd: repoDir });
  } catch (error) {
    console.error(`✗ 拉取远端失败（离线？）：${error instanceof Error ? error.message : error}`);
    console.error(`  当前版本仍可用于运行：${before.head}`);
    process.exit(1);
  }

  const behind = git(['rev-list', '--count', `HEAD..@{u}`]);
  const target = git(['rev-parse', '--short', '@{u}']);
  const targetDate = git(['log', '-1', '--format=%ad', '--date=short', '@{u}']);
  console.log(`  远端   ${target}（${targetDate}）· 落后 ${behind} 个提交`);

  if (behind === '0') {
    console.log('\n✓ 已是最新，无需更新\n');
    return;
  }
  if (DRY_RUN) {
    console.log('\n（--dry-run：不做任何改动）\n');
    return;
  }

  const lockBefore = lockfileHash();
  try {
    run('git', ['pull', '--ff-only']);
  } catch {
    console.error('\n✗ pull --ff-only 失败（本地有分叉或未提交改动）。');
    console.error('  处理完本地改动后重跑；当前版本仍可用于运行。\n');
    process.exit(1);
  }

  const after = {
    head: git(['rev-parse', '--short', 'HEAD']),
    subject: git(['log', '-1', '--format=%s']),
  };
  console.log(`\n✓ 已更新：${before.head} → ${after.head}（${after.subject}）`);

  if (lockfileHash() !== lockBefore) {
    console.log('  依赖有变更，安装中…');
    try {
      run('pnpm', ['install', '--silent']);
    } catch {
      console.error('✗ 依赖安装失败；harness 可能暂时不可用，但技能执行（直连）不受影响。');
      process.exit(1);
    }
  }

  // 冒烟：只验 runtime 能起来（不真调模型，避免无谓开销与费用）
  try {
    const smoke = execFileSync(
      process.execPath,
      ['--import', 'tsx/esm', binPath, '--help'],
      { cwd: repoDir, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    console.log(`  冒烟   runtime 可启动（--help 输出 ${smoke.split('\n').length} 行）`);
  } catch (error) {
    console.error(
      `  冒烟   ✗ runtime 启动失败：${error instanceof Error ? error.message : error}`,
    );
    console.error('  更新本身成功，但运行前请先修好 runtime；技能执行（直连）不受影响。');
    process.exit(1);
  }

  console.log('\n✓ 更新完成。harness 是可选引擎，重启 api 后生效。\n');
}

main();
