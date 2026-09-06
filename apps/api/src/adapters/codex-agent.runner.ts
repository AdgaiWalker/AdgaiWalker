import { spawn } from 'node:child_process';
import { Injectable } from '@nestjs/common';
import type { AgentRunInput, AgentRunResult, AgentRunnerPort } from '../ports/agent-runner.port';

export function parseCodexJsonl(raw: string): { output: unknown; events: unknown[] } {
  const events: unknown[] = [];
  let lastMessage: string | undefined;
  for (const line of raw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    let event: any;
    try { event = JSON.parse(line); }
    catch { throw new Error('runner-output-invalid-json'); }
    events.push(event);
    if (event.type === 'final' && event.output !== undefined) return { output: event.output, events };
    if (event.type === 'response.completed' && event.response?.output !== undefined) return { output: event.response.output, events };
    if (event.item?.type === 'agent_message' && typeof event.item.text === 'string') lastMessage = event.item.text;
    if (event.type === 'message' && typeof event.text === 'string') lastMessage = event.text;
  }
  if (lastMessage) {
    try { return { output: JSON.parse(lastMessage), events }; }
    catch { throw new Error('runner-output-invalid-json'); }
  }
  throw new Error('runner-output-missing');
}

/**
 * 解析 codex 启动目标。安全边界：spawn 一律 shell:false，命令行只允许固定 flag 与本机路径；
 * 任何调用方数据（尤其访客 prompt）只经 stdin 传入，永不成为 shell 语法。
 * Windows 上 shell:false 无法执行 npm 的 .cmd shim（现代 Node 直接拒绝），因此：
 * - CODEX_CLI_PATH 指到 .js 入口 → 用当前 node 启动；
 * - 其余（.exe 或 unix 可执行）直接 spawn；默认 `codex` 在 Windows 依赖 PATH 里的 codex.exe。
 */
export function resolveCodexCommand(
  raw: string | undefined,
  platform: NodeJS.Platform = process.platform,
): { file: string; prefix: string[] } {
  const command = raw?.trim() || 'codex';
  if (platform === 'win32' && /\.(js|mjs|cjs)$/i.test(command)) {
    return { file: process.execPath, prefix: [command] };
  }
  return { file: command, prefix: [] };
}

@Injectable()
export class CodexAgentRunner implements AgentRunnerPort {
  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const started = Date.now();
    const { file, prefix } = resolveCodexCommand(process.env.CODEX_CLI_PATH);
    const args = [...prefix, 'exec', '--json', '--ephemeral', '-s', 'read-only', '-C', input.cwd];
    if (input.outputSchemaPath) args.push('--output-schema', input.outputSchemaPath);
    args.push('-');
    return new Promise((resolve, reject) => {
      const child = spawn(file, args, { cwd: input.cwd, shell: false, windowsHide: true });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        child.kill();
        settled = true;
        reject(new Error('runner-timeout'));
      }, input.timeoutMs ?? 10 * 60 * 1000);
      const abort = () => {
        if (settled) return;
        child.kill();
        settled = true;
        clearTimeout(timeout);
        reject(new Error('runner-aborted'));
      };
      input.signal?.addEventListener('abort', abort, { once: true });
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
      // stdin 写入失败（如目标进程早退触发 EPIPE）不在这里终结：由 exit code / 输出解析兜底报错
      child.stdin.on('error', () => {});
      child.stdin.end(input.prompt, 'utf8');
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`runner-spawn-failed:${error.message}`));
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`runner-exit-${code ?? 'unknown'}${stderr.trim() ? `:${stderr.trim().slice(0, 300)}` : ''}`));
          return;
        }
        try {
          const parsed = parseCodexJsonl(stdout);
          resolve({ output: parsed.output, rawEvents: parsed.events, elapsedMs: Date.now() - started });
        } catch (error) {
          reject(error);
        }
      });
    });
  }
}
