import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'node:child_process';
import { CodexAgentRunner, parseCodexJsonl, resolveCodexCommand } from './codex-agent.runner';

const spawnMock = vi.mocked(spawn);

describe('Codex JSONL adapter', () => {
  it('extracts the final structured output and preserves progress events', () => {
    const result = parseCodexJsonl([
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"progress"}}',
      '{"type":"final","output":{"stage":"EDIT","output":{"body":"done"}}}',
    ].join('\n'));
    expect(result.output).toEqual({ stage: 'EDIT', output: { body: 'done' } });
    expect(result.events).toHaveLength(3);
  });

  it('rejects malformed or missing final output', () => {
    expect(() => parseCodexJsonl('{"type":"turn.started"}')).toThrow('runner-output-missing');
    expect(() => parseCodexJsonl('not-json')).toThrow('runner-output-invalid-json');
  });
});

describe('resolveCodexCommand', () => {
  it('directly spawns plain executables', () => {
    expect(resolveCodexCommand(undefined, 'linux')).toEqual({ file: 'codex', prefix: [] });
    expect(resolveCodexCommand('codex', 'darwin')).toEqual({ file: 'codex', prefix: [] });
    expect(resolveCodexCommand('C:\\bin\\codex.exe', 'win32')).toEqual({ file: 'C:\\bin\\codex.exe', prefix: [] });
  });

  it('launches .js entries through node on win32 (npm shim is not directly executable without a shell)', () => {
    const resolved = resolveCodexCommand('C:\\bin\\codex.js', 'win32');
    expect(resolved.file).toBe(process.execPath);
    expect(resolved.prefix).toEqual(['C:\\bin\\codex.js']);
  });
});

describe('CodexAgentRunner security boundary', () => {
  beforeEach(() => { spawnMock.mockReset(); });

  function fakeChild() {
    const handlers = new Map<string, Array<(value?: unknown) => void>>();
    const register = (event: string, fn: (value?: unknown) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), fn]);
    };
    const emit = (event: string, value?: unknown) => { handlers.get(event)?.forEach((fn) => fn(value)); };
    return {
      on: vi.fn((event: string, fn: (value?: unknown) => void) => { register(event, fn); }),
      kill: vi.fn(),
      stdin: { end: vi.fn(), on: vi.fn() },
      stdout: { on: vi.fn((event: string, fn: (value?: unknown) => void) => { register(`stdout:${event}`, fn); }) },
      stderr: { on: vi.fn((event: string, fn: (value?: unknown) => void) => { register(`stderr:${event}`, fn); }) },
      emit,
    };
  }

  it('never puts caller text on the command line; prompt goes to stdin and shell stays off', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as never);
    const runner = new CodexAgentRunner();
    const sentinel = 'USER&INPUT `rm -rf /` & whoami';

    const pending = runner.run({ prompt: sentinel, cwd: '/srv/workspace', timeoutMs: 5_000 });
    child.emit('stdout:data', Buffer.from('{"type":"final","output":{"ok":true}}\n'));
    child.emit('close', 0);
    const result = await pending;

    expect(result.output).toEqual({ ok: true });
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [file, args, options] = spawnMock.mock.calls[0] as unknown as [string, string[], { shell?: boolean }];
    expect(options.shell).toBe(false);
    // 访客文本绝不出现在可执行文件名或任何参数里（`-` 占位符表示 prompt 由 stdin 读入）
    expect(String(file)).not.toContain('USER');
    expect(args.every((arg) => !String(arg).includes('USER'))).toBe(true);
    expect(args[args.length - 1]).toBe('-');
    expect(child.stdin.end).toHaveBeenCalledWith(sentinel, 'utf8');
  });

  it('propagates non-zero exit as runner error', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as never);
    const runner = new CodexAgentRunner();

    const pending = runner.run({ prompt: 'x', cwd: '/srv', timeoutMs: 5_000 });
    child.emit('stderr:data', Buffer.from('boom'));
    child.emit('close', 3);
    await expect(pending).rejects.toThrow('runner-exit-3');
  });
});
