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

@Injectable()
export class CodexAgentRunner implements AgentRunnerPort {
  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const started = Date.now();
    const command = process.env.CODEX_CLI_PATH?.trim() || 'codex';
    const args = ['exec', '--json', '--ephemeral', '-s', 'read-only', '-C', input.cwd];
    if (input.outputSchemaPath) args.push('--output-schema', input.outputSchemaPath);
    args.push(input.prompt);
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd: input.cwd, shell: process.platform === 'win32', windowsHide: true });
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
