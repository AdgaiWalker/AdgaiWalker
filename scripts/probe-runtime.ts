/**
 * 脱敏运行探针（Mac 本地）。真实发起一次隔离会话的模型请求，
 * 记录版本、脱敏请求、进程退出证据、延迟与峰值 RSS；不打印密钥，不写站主正文。
 * 放行条件是当前运行环境的真实探针结果，不以电脑操作系统决定放行。
 * 凭据只从本机 DSH 凭据库读取，绝不打印、绝不写入报告。
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCredential } from '../apps/api/src/runtime/dsh-credentials-file';

type HarnessLaunchModule = typeof import('../apps/api/src/runtime/harness-launch');
type HarnessProviderFacts = import('../apps/api/src/runtime/harness-launch').HarnessProviderFacts;

/** 探针使用的模型通道：全部字段都来自 dsh 原生目录，不在探针里写死提供方。 */
type ProbeChannel = {
  provider: string;
  model: string | null;
  facts: HarnessProviderFacts;
  credentialSource: string;
  /** 供报告：这条通道是怎么被选中的。 */
  selection: string;
};
type ProbeOutcome = {
  status: 'pass' | 'fail';
  reason: string;
  elapsedMs: number;
  answer: { chars: number; sha256: string } | null;
  processExited: boolean;
  closeError: string | null;
  credentialSource: string | null;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'apps/api/package.json'));
const reportPath = path.join(root, 'docs/evidence/runtime-probe.json');
const PROBE_PROMPT = '只回复这两个字符：好。不要解释，不要调用任何工具。';

/**
 * 只读本机 DSH 凭据库里的模型凭据引用。返回空串表示没有可用凭据。
 * 读到的值只进内存，用于子进程凭据转发，不打印、不写报告。
 */
function readCredentialRef(home: string, envName: string): string {
  return readCredential(home, envName) ?? '';
}

/**
 * 解析探针通道：显式 WALKER_PROBE_PROVIDER/MODEL 优先，否则 dsh 目录的默认模型，
 * 再否则第一个有凭据的已支持接口。都不满足则返回 null（如实报不可用，不绕过）。
 */
async function resolveChannel(
  launch: HarnessLaunchModule,
  modelHome: string,
): Promise<ProbeChannel | null> {
  const { FsModelDirectory } = (await import('../apps/api/src/adapters/fs-model-directory')) as typeof import('../apps/api/src/adapters/fs-model-directory');
  const { pickUsableProvider } = (await import('@walker/shared')) as typeof import('@walker/shared');
  const directory = new FsModelDirectory(modelHome);
  const snapshot = directory.snapshot();
  const explicitProvider = process.env.WALKER_PROBE_PROVIDER?.trim() || null;
  const explicitModel = process.env.WALKER_PROBE_MODEL?.trim() || null;

  const picked = pickUsableProvider(snapshot, { provider: explicitProvider, model: explicitModel });
  if (!picked) return null;

  const known = launch.DEFAULT_PROVIDER_FACTS;
  const facts: HarnessProviderFacts = {
    route: picked.provider.id,
    settingsSection:
      snapshot.providers.find((p) => p.id === picked.provider.id)?.interfaceName ?? known.settingsSection,
    baseURL: picked.provider.baseURL,
    apiKeyRef: picked.provider.apiKeyRef,
    models: picked.provider.models,
  };
  return {
    provider: facts.route,
    model: picked.model,
    facts,
    credentialSource: 'dsh-directory-refs',
    selection: explicitProvider
      ? '显式 WALKER_PROBE_PROVIDER'
      : snapshot.defaultProvider
        ? 'dsh agent-default-model'
        : '首个有凭据的已支持接口',
  };
}

function redact(value: string, secret: string): string {
  return secret ? value.split(secret).join('[redacted]') : value;
}

/** 从会话事件里提取 turn/end 的失败原因，供空回答时如实记录。 */
function turnFailureReason(events: unknown[]): string | null {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index] as { type?: string; data?: unknown } | null;
    if (!event || event.type !== 'turn/end') continue;
    const reason = (event.data as { reason?: { kind?: string; error?: { message?: string; code?: string; status?: number } } } | undefined)?.reason;
    if (reason?.kind === 'error' && reason.error) {
      const parts = [reason.error.code, reason.error.status ? `status ${reason.error.status}` : '', reason.error.message].filter(Boolean);
      return `模型请求失败：${parts.join(' / ')}`;
    }
    return null;
  }
  return null;
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

async function runProbe(
  secret: string,
  session: string,
  materialsDir: string,
  channel: ProbeChannel,
): Promise<ProbeOutcome> {
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
    provider: channel.provider,
    model: channel.model ?? undefined,
    providerFacts: channel.facts,
    homeDir: session,
    materialsDir,
    // 不替探针补写 WALKER_DSH_RUNTIME_BIN；必须验证当前应用的配置/包解析路径，避免绕过生产启动链。
    parentEnv: { ...process.env },
    credential: { envName: channel.facts.apiKeyRef, value: secret },
  })();
  try {
    const result = await harness.run(PROBE_PROMPT);
    outcome.elapsedMs = Date.now() - started;
    const raw = result.finalResponse;
    const text = typeof raw === 'string' ? raw : (raw != null ? JSON.stringify(raw) : '');
    if (!text.trim()) {
      const failure = turnFailureReason(result.events ?? []);
      outcome.reason = failure ?? '模型返回空回答';
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
  const launch = (await import('../apps/api/src/runtime/harness-launch')) as HarnessLaunchModule;
  // R26：探针只认 AdgaiWalker 自己的 Harness home，不回落站主个人环境（~/.dsh / DSH_HOME）。
  const { resolveModelHomeDir } = (await import('../apps/api/src/adapters/fs-model-directory')) as typeof import('../apps/api/src/adapters/fs-model-directory');
  const modelHome = resolveModelHomeDir();
  const session = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-runtime-probe-'));
  try {
    const materialsDir = path.join(session, 'materials');
    fs.mkdirSync(materialsDir, { recursive: true });
    fs.writeFileSync(path.join(materialsDir, 'probe-note.md'), '隔离测试资料，不是站主正文。\n');

    const before = process.memoryUsage().rss;
    const channel = await resolveChannel(launch, modelHome);
    const explicitSecret = channel ? (process.env[channel.facts.apiKeyRef]?.trim() || null) : null;
    const secret = explicitSecret ?? (channel ? readCredentialRef(modelHome, channel.facts.apiKeyRef) : '');
    const outcome: ProbeOutcome = channel && secret
      ? await runProbe(secret, session, materialsDir, channel)
      : {
          status: 'fail',
          reason: channel
            ? `通道 ${channel.provider} 没有可用凭据（引用 ${channel.facts.apiKeyRef}）`
            : '本机 dsh 目录里没有「已支持接口 + 有凭据」的可用通道；不能用直连模型代替探针',
          elapsedMs: 0,
          answer: null,
          processExited: false,
          closeError: null,
          credentialSource: null,
        };

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
        channel: channel
          ? {
              provider: channel.provider,
              model: channel.model,
              interface: channel.facts.settingsSection,
              baseURL: channel.facts.baseURL,
              credentialRef: channel.facts.apiKeyRef,
              selection: channel.selection,
            }
          : null,
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
    console.log(JSON.stringify({ reportPath, local: report.local.status, processExited: report.local.processExited, source: outcome.credentialSource }));
    process.exitCode = outcome.status === 'pass' && outcome.processExited ? 0 : 1;
  } finally {
    fs.rmSync(session, { recursive: true, force: true });
  }
}

void main();
