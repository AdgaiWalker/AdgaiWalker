/**
 * DeepSeek Harness 的 RuntimePort。SDK 0.1.5-rc.2 与同版本 dsh 才允许启动。
 * 一次只跑一个调用；会话绑定访客和 Agent 修订；不写发布状态。
 */
import { createRequire } from 'node:module';
import {
  JsonRpcResponseError,
  RequestTimeoutError,
  SdkProtocolError,
  TransportClosedError,
} from '@deepseek-ai/dsh-sdk-client';
import type {
  RuntimeEvent,
  RuntimeExitProof,
  RuntimeFailure,
  RuntimeOutputKind,
  RuntimePort,
  RuntimeRunRequest,
  RuntimeRunResult,
  RuntimeUsage,
} from '../ports/runtime.port';
import { buildHarnessRuntimeFactory, type HarnessLaunchOptions } from '../runtime/harness-launch';

const require = createRequire(__filename);

export interface SdkRuntime {
  start?: () => Promise<void>;
  run(
    input: string,
    opts?: { sessionId?: string; onNotification?: (notification: unknown) => void },
  ): Promise<{ sessionId: string; finalResponse: unknown }>;
  close(): Promise<void>;
}

export function readInstalledRuntimeVersions(): { sdk: string; runtime: string } {
  const sdk = require('@deepseek-ai/dsh-sdk-client/package.json') as { version: string };
  const runtime = require('@deepseek-ai/dsh/package.json') as { version: string };
  return { sdk: sdk.version, runtime: runtime.version };
}

export function classifyModelText(text: string): { outputKind: RuntimeOutputKind; json: unknown | null } {
  const trimmed = text.trim();
  if (!trimmed) return { outputKind: 'bad-json', json: null };
  const whole = parseObject(trimmed);
  if (whole.ok) return { outputKind: 'json', json: whole.value };
  const blocks = topLevelObjects(trimmed);
  const parsed = blocks.flatMap((block) => {
    const item = parseObject(block);
    return item.ok ? [item.value] : [];
  });
  if (blocks.length > 1 && parsed.length > 1) return { outputKind: 'duplicate-contract', json: null };
  if (parsed.length === 1 && blocks.length === 1) return { outputKind: 'json', json: parsed[0] };
  return { outputKind: 'bad-json', json: null };
}

export function readRuntimeUsage(events: readonly unknown[]): RuntimeUsage | null {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens: number | null = null;
  let sawUsage = false;
  for (const raw of events) {
    const usage = usageOf(raw);
    if (usage === 'absent') continue;
    if (usage === 'unknown') return null;
    sawUsage = true;
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    if (usage.cacheReadTokens !== null) cacheReadTokens = (cacheReadTokens ?? 0) + usage.cacheReadTokens;
  }
  return sawUsage ? { inputTokens, outputTokens, cacheReadTokens } : null;
}

function parseObject(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    const value = JSON.parse(text) as unknown;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false };
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

function topLevelObjects(text: string): string[] {
  const found: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        found.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return found;
}

function usageOf(raw: unknown): RuntimeUsage | 'absent' | 'unknown' {
  if (!isRecord(raw)) return 'absent';
  const event = raw.params && isRecord(raw.params) && isRecord(raw.params.event) ? raw.params.event : raw;
  if (!isRecord(event) || event.type !== 'step/end') return 'absent';
  const data = isRecord(event.data) ? event.data : null;
  if (!data || !('usage' in data)) return 'absent';
  const usage = data.usage;
  if (!isRecord(usage)) return 'unknown';
  if (!isFiniteNumber(usage.inputTokens) || !isFiniteNumber(usage.outputTokens)) return 'unknown';
  if ('cacheReadTokens' in usage && usage.cacheReadTokens !== undefined && !isFiniteNumber(usage.cacheReadTokens)) {
    return 'unknown';
  }
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: isFiniteNumber(usage.cacheReadTokens) ? usage.cacheReadTokens : null,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function classifyError(error: unknown): RuntimeFailure {
  if (error instanceof TransportClosedError || (error instanceof Error && error.name === 'TransportClosedError')) {
    return 'transport-closed';
  }
  if (error instanceof RequestTimeoutError) return 'timeout';
  if (error instanceof SdkProtocolError || error instanceof JsonRpcResponseError) return 'protocol-error';
  return 'runtime-error';
}

function ownerKey(owner: RuntimeRunRequest['owner']): string | null {
  if (!owner.visitorKey || !owner.agentRevisionId) return null;
  return `${owner.visitorKey}\n${owner.agentRevisionId}`;
}

export class HarnessRuntimeAdapter implements RuntimePort {
  private runtime: SdkRuntime | null = null;
  private readonly sessions = new Map<string, string>();
  private readonly listeners = new Set<(event: RuntimeEvent) => void>();
  private inflight = false;
  private mismatch = false;

  constructor(
    private readonly factory: () => SdkRuntime,
    private readonly versions: () => { sdk: string; runtime: string } = readInstalledRuntimeVersions,
  ) {}

  async start(): Promise<void> {
    const versions = this.versions();
    if (versions.sdk !== versions.runtime) {
      this.mismatch = true;
      throw new Error('version-mismatch');
    }
    this.mismatch = false;
    if (!this.runtime) {
      this.runtime = this.factory();
      await this.runtime.start?.();
    }
  }

  observe(listener: (event: RuntimeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async run(request: RuntimeRunRequest): Promise<RuntimeRunResult> {
    if (this.mismatch || this.versions().sdk !== this.versions().runtime) {
      this.mismatch = true;
      return { ok: false, failure: 'version-mismatch', sessionId: null };
    }
    const owner = ownerKey(request.owner);
    if (!owner) return { ok: false, failure: 'runtime-error', sessionId: request.sessionId ?? null };
    if (request.outputContract && request.prompt.includes(request.outputContract)) {
      return { ok: false, failure: 'duplicate-contract', sessionId: request.sessionId ?? null };
    }
    if (request.sessionId) {
      const bound = this.sessions.get(request.sessionId);
      if (bound && bound !== owner) return { ok: false, failure: 'session-owner-mismatch', sessionId: request.sessionId };
    }
    if (this.inflight) return { ok: false, failure: 'busy', sessionId: request.sessionId ?? null };

    const prompt = request.outputContract ? `${request.prompt}\n\n${request.outputContract}` : request.prompt;
    this.inflight = true;
    const notifications: unknown[] = [];
    try {
      if (!this.runtime) await this.start();
      const runtime = this.runtime;
      if (!runtime) return { ok: false, failure: 'runtime-error', sessionId: request.sessionId ?? null };
      const result = await runtime.run(prompt, {
        ...(request.sessionId ? { sessionId: request.sessionId } : {}),
        onNotification: (notification) => {
          notifications.push(notification);
          const text = textDelta(notification);
          if (text) this.emit({ kind: 'text', text }, request.observe);
        },
      });
      const bound = this.sessions.get(result.sessionId);
      if (bound && bound !== owner) return { ok: false, failure: 'session-owner-mismatch', sessionId: result.sessionId };
      this.sessions.set(result.sessionId, owner);
      const text = textOf(result.finalResponse);
      const classified = classifyModelText(text);
      const usage = readRuntimeUsage(notifications);
      this.emit({ kind: 'usage', usage }, request.observe);
      return { ok: true, sessionId: result.sessionId, text, json: classified.json, usage, outputKind: classified.outputKind };
    } catch (error) {
      const failure = classifyError(error);
      if (failure === 'transport-closed') {
        const dead = this.runtime;
        this.runtime = null;
        void dead?.close().catch(() => {});
      }
      return { ok: false, failure, sessionId: request.sessionId ?? null };
    } finally {
      this.inflight = false;
    }
  }

  async close(): Promise<RuntimeExitProof> {
    this.listeners.clear();
    const runtime = this.runtime;
    if (!runtime) return { exited: true };
    await runtime.close();
    this.runtime = null;
    return { exited: true };
  }

  private emit(event: RuntimeEvent, direct?: (event: RuntimeEvent) => void): void {
    direct?.(event);
    for (const listener of this.listeners) listener(event);
  }
}

function textDelta(notification: unknown): string | null {
  if (!isRecord(notification) || notification.method !== 'session.event') return null;
  const params = isRecord(notification.params) ? notification.params : null;
  const event = params && isRecord(params.event) ? params.event : null;
  if (!event || event.type !== 'assistant/chunk') return null;
  const data = isRecord(event.data) ? event.data : null;
  const chunk = data && isRecord(data.chunk) ? data.chunk : null;
  if (!chunk || chunk.type !== 'text-delta' || typeof chunk.text !== 'string' || !chunk.text) return null;
  return chunk.text;
}

export function harnessRuntimeAdapter(launch: HarnessLaunchOptions): HarnessRuntimeAdapter {
  const create = buildHarnessRuntimeFactory(launch);
  return new HarnessRuntimeAdapter(() => create());
}
