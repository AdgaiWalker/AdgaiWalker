/**
 * 脱敏运行探针。只写隔离会话目录和报告，不写站主正文，不打印密钥。
 * 没有本地和 Windows 的通过证据时退出码为 1。
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(process.cwd(), 'apps/api/package.json'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'docs/evidence/runtime-probe.json');
const secret = process.env.DEEPSEEK_API_KEY?.trim() ?? '';

function redact(value: string): string {
  return secret ? value.split(secret).join('[redacted]') : value;
}

function versions() {
  const sdk = require('@deepseek-ai/dsh-sdk-client/package.json') as { version: string };
  const runtime = require('@deepseek-ai/dsh/package.json') as { version: string };
  const bin = spawnSync('dsh', ['--version'], { encoding: 'utf8' });
  return {
    sdk: sdk.version,
    packageRuntime: runtime.version,
    pathBin: (bin.stdout || bin.stderr || '').trim(),
  };
}

const session = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-runtime-probe-'));
const started = Date.now();
const before = process.memoryUsage().rss;
let status = 'fail';
let reason = '未取得真实回答';
try {
  const found = versions();
  if (!secret) {
    reason = '本地没有 DEEPSEEK_API_KEY，不能用直连模型代替探针';
  } else if (found.pathBin !== found.packageRuntime) {
    reason = 'PATH 上的 dsh 与已安装 runtime 包版本不一致';
  } else {
    reason = '密钥存在，但本探针不在缺少隔离证据时调用模型';
  }
  if (found.sdk !== found.packageRuntime) reason = 'SDK 与 runtime 包版本不一致';
} catch (error) {
  reason = error instanceof Error ? error.message : '探针失败';
}
const report = {
  generatedAt: new Date().toISOString(),
  session: path.basename(session),
  versions: versions(),
  request: { prompt: '[redacted-test-prompt]', materials: 'isolated-temp' },
  local: {
    status,
    reason: redact(reason),
    elapsedMs: Date.now() - started,
    rssBytes: process.memoryUsage().rss,
    rssDeltaBytes: process.memoryUsage().rss - before,
    processExited: true,
  },
  windows: { status: 'not-run', reason: '本机没有目标 Windows 的进程退出证据' },
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ reportPath, local: report.local.status, windows: report.windows.status }));
process.exit(runtimeProbeExit(report));

function runtimeProbeExit(value: { local: { status: string }; windows: { status: string } }): number {
  return value.local.status === 'pass' && value.windows.status === 'pass' ? 0 : 1;
}
