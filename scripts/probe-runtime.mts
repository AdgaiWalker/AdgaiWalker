/**
 * 脱敏运行探针（Mac 本地）。真实发起一次隔离会话的模型请求，
 * 记录版本、脱敏请求、进程退出证据、延迟与峰值 RSS；不打印密钥，不写站主正文。
 * 放行条件只有本地这一项：本机是 Mac 网页版，不以 Windows 为放行条件（2026-09-22 站主决定）。
 * 凭据只从本机 DSH 凭据库读取，绝不打印、绝不写入报告。
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type HarnessLaunchModule = typeof import('../apps/api/src/runtime/harness-launch');
type ProbeOutcome = {
  status: 'pass' | 'fail';
  reason: string;
  elapsedMs: number;
  answer: { chars: number; sha256: string } | null;
  processExited: boolean;
  closeError: string | null;
  credentialSource: string | null;
};

const require = createRequire(path.join(process.cwd(), 'apps/api/package.json'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'docs/evidence/runtime-probe.json');
const PROBE_PROMPT = '只回复这两个字符：好。不要解释，不要调用任何工具。';

/**
 * 只读本机 DSH 凭据库里的模型凭据引用。返回空串表示没有可用凭据。
 * 读到的值只进内存，用于子进程凭据转发，不打印、不写报告。
 */
function readCredentialRef(home: string, envName: string): string {
  const file = path.join(home, '.credentials.yaml');
  if (!fs.existsSync(file)) return '';
  let inRefs = false;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (/^refs:\s*$/.test(line)) { inRefs = true; continue; }
    if (inRefs && /^\S/.test(line)) break;
    if (!inRefs) continue;
    const matched = line.match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
    if (matched && matched[1] === envName) return matched[2].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

function redact(value: string, secret: string): string {
  return secret ? value.split(secret).join('[redacted]') : value;
}

function versions() {
  const sdk = require('@deepseek-ai/dsh-sdk-client/package.json') as { version: string };
  const runtime = require('@deepseek-ai/dsh/package.json') as { version: string };
  return { sdk: sdk.version, packageRuntime: runtime.version };
}

/** 命令行里还留着隔离家目录，就说明 runtime 子进程没有退出。 */
function liveProcessesCarrying(marker: string): string[] {
  const ps = spawnSync('ps', ['-Ao', 'pid=,command='], { encoding: 'utf8' });
  return (ps.stdout ?? '')
    .split('\n')
    .filter((line) => line.includes(marker) && !line.includes(String(process.pid)))
    .map((line) => line.trim());
}

async function runProbe(secret: string, session: string, materialsDir: string): Promise<ProbeOutcome> {
  const started = Date.now();
  const outcome: ProbeOutcome = {
    status: 'fail',
    reason: '未取得真实回答',
    elapsedMs: 0,
    answer: null,
    processExited: false,
    closeError: null,
    credentialSource: 'dsh-credentials-refs',
  };
  const mod = (await import('../apps/api/src/runtime/harness-launch')) as HarnessLaunchModule;
  const harness = mod.buildHarnessRuntimeFactory({
    audience: 'public',
    provider: 'deepseek-official',
    homeDir: session,
    materialsDir,
    parentEnv: { ...process.env },
    credential: { envName: 'DEEPSEEK_API_KEY', value: secret },
  })();
  try {
    const result = await harness.run(PROBE_PROMPT);
    outcome.elapsedMs = Date.now() - started;
    const text = typeof result.finalResponse === 'string' ? result.finalResponse : JSON.stringify(result.finalResponse ?? '');
    if (!text.trim()) {
      outcome.reason = '模型返回空回答';
    } else {
      outcome.answer = { chars: text.length, sha256: createHash('sha256').update(text).digest('hex') };
      outcome.status = 'pass';
      outcome.reason = '已取得真实回答并完成关闭';
    }
  } catch (error) {
    outcome.elapsedMs = Date.now() - started;
    outcome.reason = redact(error instanceof Error ? error.message : '探针调用失败', secret);
  } finally {
    try {
      await harness.close();
    } catch (error) {
      outcome.closeError = redact(error instanceof Error ? error.message : '关闭失败', secret);
    }
    outcome.processExited = liveProcessesCarrying(session).length === 0;
  }
  return outcome;
}

async function main(): Promise<void> {
  const found = versions();
  const dshHome = process.env.DSH_HOME?.trim() || path.join(os.homedir(), '.dsh');
  const secret = process.env.DEEPSEEK_API_KEY?.trim() || readCredentialRef(dshHome, 'DEEPSEEK_API_KEY');
  const session = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-runtime-probe-'));
  const materialsDir = path.join(session, 'materials');
  fs.mkdirSync(materialsDir, { recursive: true });
  fs.writeFileSync(path.join(materialsDir, 'probe-note.md'), '隔离测试资料，不是站主正文。\n');

  const before = process.memoryUsage().rss;
  const outcome: ProbeOutcome = secret
    ? await runProbe(secret, session, materialsDir)
    : { status: 'fail', reason: '本机没有可用模型凭据，不能用直连模型代替探针', elapsedMs: 0, answer: null, processExited: false, closeError: null, credentialSource: null };

  const report = {
    generatedAt: new Date().toISOString(),
    session: path.basename(session),
    platform: process.platform,
    versions: found,
    request: {
      prompt: '[redacted-test-prompt]',
      promptChars: PROBE_PROMPT.length,
      materials: 'isolated-temp',
      credentialSource: outcome.credentialSource,
    },
    local: {
      status: outcome.status,
      reason: redact(outcome.reason, secret),
      elapsedMs: outcome.elapsedMs,
      answer: outcome.answer,
      rssBytes: process.memoryUsage().rss,
      rssDeltaBytes: process.memoryUsage().rss - before,
      processExited: outcome.processExited,
      closeError: outcome.closeError === null ? null : redact(outcome.closeError, secret),
    },
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.rmSync(session, { recursive: true, force: true });
  console.log(JSON.stringify({ reportPath, local: report.local.status, processExited: report.local.processExited, source: outcome.credentialSource }));
  process.exit(outcome.status === 'pass' && outcome.processExited ? 0 : 1);
}

void main();
