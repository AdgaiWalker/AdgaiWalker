/**
 * DeepSeek Harness 的 RuntimePort。SDK 0.1.5-rc.3 与同版本 dsh 才允许启动。
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

const requireModule = createRequire(__filename);

export interface SdkRuntime {
  start?: () => Promise<void>;
  run(
    input: string,
    opts?: { sessionId?: string; onNotification?: (notification: unknown) => void },
  ): Promise<{ sessionId: string; finalResponse: unknown }>;
  close(): Promise<void>;
}

export function readInstalledRuntimeVersions(): { sdk: string; runtime: string } {
  const sdk = requireModule('@deepseek-ai/dsh-sdk-client/package.json') as { version: string };
  const runtime = requireModule('@deepseek-ai/dsh/package.json') as { version: string };
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
  // rc.3 把用量挂在 assistant/message 上（实测 data.usage =
  // {inputTokens, outputTokens, totalTokens, cacheReadTokens, reasoningTokens}）；
  // step/end 的 data 只有 {turn, step}，从来没有 usage。
  if (!isRecord(event) || event.type !== 'assistant/message') return 'absent';
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
  /** 当前 runtime 实例服务的是哪个 Agent（R26）；null = 受众级实例。 */
  private runtimeAgentId: string | null = null;
  /**
   * 当前实例生效的系统提示词（R32）。提示词是**修订级**配置（换版本即变），
   * 而实例按 agentId 缓存——不比对它就会拿旧人格跑新修订。
   */
  private runtimePersona: string | null = null;
  private runtimeSelection: string | null = null;
  private readonly sessions = new Map<string, string>();
  private readonly listeners = new Set<(event: RuntimeEvent) => void>();
  private inflight = false;
  private mismatch = false;

  constructor(
    private readonly factory: (agentId: string | null, persona?: string | null, selection?: { providerId?: string | null; modelId?: string | null }) => SdkRuntime,
    private readonly versions: () => { sdk: string; runtime: string } = readInstalledRuntimeVersions,
  ) {}

  async start(owner?: RuntimeRunRequest['owner']): Promise<void> {
    await this.ensureRuntime(owner?.agentId ?? null, owner?.systemPrompt ?? null, owner);
  }

  /**
   * 确保有一个「属于指定 Agent」的 runtime 在跑；不同 Agent 必须换实例。
   *
   * 为什么必须换：每个 Agent 有自己的 home（配置、插件、会话都在里面），
   * 复用别的 Agent 的实例会把两套配置混在一起。
   * 切换时先 close 旧实例（拿退出证明）再建新的——保持 R12 单槽纪律：不留孤儿进程、
   * 不并发跑两个模型进程。
   */
  private async ensureRuntime(agentId: string | null, persona?: string | null, selection?: { providerId?: string | null; modelId?: string | null }): Promise<void> {
    const versions = this.versions();
    if (versions.sdk !== versions.runtime) {
      this.mismatch = true;
      throw new Error('version-mismatch');
    }
    this.mismatch = false;
    const nextPersona = persona?.trim() ? persona.trim() : null;
    const nextSelection = `${selection?.providerId ?? ''}\n${selection?.modelId ?? ''}`;
    // 复用条件：同一个 Agent **且**提示词没变。提示词属于修订，换了就必须重建，
    // 否则新修订会继续跑旧人格（R32 的真实缺陷）。
    if (this.runtime && this.runtimeAgentId === agentId && this.runtimePersona === nextPersona && this.runtimeSelection === nextSelection) return;
    if (this.runtime) await this.close();
    this.runtime = this.factory(agentId, nextPersona, selection);
    this.runtimeAgentId = agentId;
    this.runtimePersona = nextPersona;
    this.runtimeSelection = nextSelection;
    try {
      await this.runtime.start?.();
    } catch (error) {
      // 启动失败必须留现场：这是「运行时错误」最常见但最难排查的一类。
      console.error('[harness-runtime] start failed', JSON.stringify({
        agentId, error: String((error as Error)?.message ?? error).slice(0, 300),
      }));
      this.runtime = null;
      this.runtimeAgentId = null;
      this.runtimePersona = null;
      this.runtimeSelection = null;
      throw error;
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

    this.inflight = true;
    const notifications: unknown[] = [];
    const seenSessionResources = new Set<string>();
    const sessionResourceWrites: Promise<void>[] = [];
    let sessionResourceError: unknown = null;
    try {
      // R26：按本次运行所属的 Agent 确保实例（不同 Agent 的 home 不同，必须换实例）。
      await this.ensureRuntime(request.owner.agentId ?? null, request.owner.systemPrompt ?? null, request.owner);
      const runtime = this.runtime;
      if (!runtime) return { ok: false, failure: 'runtime-error', sessionId: request.sessionId ?? null };
      // A persisted session may outlive this process. The pinned SDK can reject its
      // first prompt after restart as "session already exists"; start a new session
      // with the verified public context instead of falling back for every turn.
      const currentSession = request.sessionId && (!request.freshPrompt || this.sessions.get(request.sessionId) === owner)
        ? request.sessionId : null;
      const rawPrompt = request.sessionId && !currentSession && request.freshPrompt
        ? request.freshPrompt : request.prompt;
      const prompt = request.outputContract ? `${rawPrompt}\n\n${request.outputContract}` : rawPrompt;
      const result = await runtime.run(prompt, {
        ...(currentSession ? { sessionId: currentSession } : {}),
        onNotification: (notification) => {
          notifications.push(notification);
          const resource = nativeResourceFromNotification(notification);
          const resourceKey = resource ? `${resource.kind}\n${resource.sessionId}` : null;
          if (resource && resourceKey && !seenSessionResources.has(resourceKey)) {
            seenSessionResources.add(resourceKey);
            sessionResourceWrites.push(Promise.resolve()
              .then(() => request.onSessionResource?.(resource))
              .then(() => undefined)
              .catch((error: unknown) => { sessionResourceError ??= error; }));
          }
          const text = textDelta(notification);
          if (text) this.emit({ kind: 'text', text }, request.observe);
        },
      });
      await Promise.all(sessionResourceWrites);
      if (sessionResourceError) throw sessionResourceError;
      const bound = this.sessions.get(result.sessionId);
      if (bound && bound !== owner) return { ok: false, failure: 'session-owner-mismatch', sessionId: result.sessionId };
      this.sessions.set(result.sessionId, owner);
      const text = textOf(result.finalResponse);
      const classified = classifyModelText(text);
      const usage = readRuntimeUsage(notifications);
      this.emit({ kind: 'usage', usage }, request.observe);
      return { ok: true, sessionId: result.sessionId, text, json: classified.json, usage, outputKind: classified.outputKind };
    } catch (error) {
      await Promise.all(sessionResourceWrites);
      const failure = classifyError(error);
      // 失败现场必须落日志：runtime-error 只是个分类，没有细节就无法排查
      // （用户只能看到 FAILED，看不到子进程到底说了什么）。
      console.error('[harness-runtime] run failed', JSON.stringify({
        agentId: request.owner.agentId ?? null,
        failure,
        errorName: (error as Error)?.name ?? typeof error,
        error: String((error as Error)?.message ?? error).slice(0, 500),
      }));
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
    if (!runtime) {
      this.runtimeAgentId = null;
      this.sessions.clear();
      return { exited: true };
    }
    await runtime.close();
    this.runtime = null;
    this.runtimeAgentId = null;
    this.runtimePersona = null;
    this.runtimeSelection = null;
    this.sessions.clear();
    return { exited: true };
  }

  private emit(event: RuntimeEvent, direct?: (event: RuntimeEvent) => void): void {
    direct?.(event);
    for (const listener of this.listeners) listener(event);
  }
}

/**
 * 从一条通知里取出本次新增的文本增量。
 *
 * rc.3 的流式文本挂在 **assistant/message** 的 `data.stream` 上：
 *   [{type:'chunk', chunk:{type:'block-start',...}},
 *    {type:'text-chunks', texts:['好'], index:0, dt:[...]}, ...]
 * 曾经这里只认 `assistant/chunk` + `chunk.type==='text-delta'`——那两个形状在 rc.3 里
 * 都不存在，所以流式文本从未真正外发过（终值靠 finalResponse 兜底，看起来"能出字"）。
 */
export function textDelta(notification: unknown): string | null {
  if (!isRecord(notification) || notification.method !== 'session.event') return null;
  const params = isRecord(notification.params) ? notification.params : null;
  const event = params && isRecord(params.event) ? params.event : null;
  if (!event || event.type !== 'assistant/message') return null;
  const data = isRecord(event.data) ? event.data : null;
  const stream = data && Array.isArray(data.stream) ? data.stream : null;
  if (!stream) return null;
  let text = '';
  for (const entry of stream) {
    if (!isRecord(entry) || entry.type !== 'text-chunks') continue;
    const texts = Array.isArray(entry.texts) ? entry.texts : [];
    for (const piece of texts) if (typeof piece === 'string') text += piece;
  }
  return text || null;
}

function nativeResourceFromNotification(notification: unknown): {
  sessionId: string;
  kind: 'native-session' | 'native-fork';
  parentSessionId?: string;
} | null {
  if (!isRecord(notification) || typeof notification.method !== 'string' || !isRecord(notification.params)) return null;
  const params = notification.params;
  if (notification.method === 'subagent.started' || notification.method === 'subagent.finished') {
    return typeof params.childSessionId === 'string' && typeof params.parentSessionId === 'string'
      ? { sessionId: params.childSessionId, kind: 'native-fork', parentSessionId: params.parentSessionId }
      : null;
  }
  if (notification.method === 'session.event' || notification.method === 'session.status') {
    return typeof params.sessionId === 'string' ? { sessionId: params.sessionId, kind: 'native-session' } : null;
  }
  return null;
}

export function harnessRuntimeAdapter(launch: HarnessLaunchOptions): HarnessRuntimeAdapter {
  const create = buildHarnessRuntimeFactory(launch);
  // persona 必须一并透传：丢掉它 Agent 提示词就永远进不了模型（R32 的真实断点）。
  return new HarnessRuntimeAdapter((agentId, persona, selection) => create(agentId, persona, selection));
}
