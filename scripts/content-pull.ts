#!/usr/bin/env node
/**
 * 本地内容拉取与同步脚本
 * 用途：一键拉取 GitHub 上的最新文章，并自动重新生成本地静态投影与知识图谱。
 *
 * 用法：
 *   pnpm content:pull
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd: string, args: string[], opts?: { capture?: boolean }) {
  return spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: opts?.capture ? 'pipe' : 'inherit',
  });
}

function main() {
  console.log('== 1/2 从 GitHub 拉取最新提交 ==');

  // 获取拉取前的 HEAD
  const beforeHeadRes = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const beforeHead = beforeHeadRes.stdout?.trim();

  const pull = run('git', ['pull', 'origin', 'main', '--rebase', '--autostash']);
  if (pull.status !== 0) {
    console.error('❌ 拉取失败，请检查网络或本地是否有未提交冲突。');
    process.exit(pull.status ?? 1);
  }

  const afterHeadRes = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const afterHead = afterHeadRes.stdout?.trim();

  if (beforeHead === afterHead) {
    console.log('\n✨ 本地工作区已是最新，无新增远端提交。');
    return;
  }

  // 查出具体变动了哪些文章
  const diffRes = spawnSync('git', ['diff', '--name-only', beforeHead, afterHead, '--', 'content/log'], {
    cwd: root,
    encoding: 'utf8',
  });
  const changedFiles = (diffRes.stdout || '')
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => path.basename(f));

  console.log('\n== 2/2 更新全站内容投影与知识图谱 ==');
  const gen = run('pnpm', ['content:gen']);
  if (gen.status !== 0) {
    process.exit(gen.status ?? 1);
  }

  console.log('\n🎉 同步成功！');
  if (changedFiles.length > 0) {
    console.log(`📄 新增/更新文章：${changedFiles.join('、')}`);
  }
  console.log('💡 本地 Obsidian / VS Code 现在可以直接打开编辑最新内容。\n');
}

main();
