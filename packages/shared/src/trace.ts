/**
 * jsonl 轨迹事件契约 v1（TECH-DESIGN §4，纯函数层，无 IO）。
 *
 * 四条纪律：
 * 1. 只追加：历史行永不改写、永不迁移；修正用新事件表达。
 * 2. 读取方容错：未知 type 保留原文不崩；解析失败的行降级为 { type:'raw', payload:{ line } }。
 * 3. 词表唯一：事件类型常量只在本文定义，api 与 admin 共用（对齐 assistant.ts 降级词表做法）。
 * 4. 正文不进轨迹：payload 禁放完整提示词、密钥、绝对路径，只留度量。
 */

/** 契约版本：读取方按 v 分支；语义变更才递增，加字段不变（TECH-DESIGN §10） */
export const TRACE_CONTRACT_VERSION = 1;

/**
 * payload 字节上限（TECH-DESIGN §4.1/§6.3：沿用事件 props 的 2000 字节口径）。
 * 写入方负责裁剪（正文、密钥、绝对路径一律不进 payload）；超过即违反契约。
 */
export const TRACE_PAYLOAD_MAX_BYTES = 2_000;

/** 事件类型词表（v1，TECH-DESIGN §4.2）。读在前写在后：新增类型先加这里与读取方容错 */
export const TRACE_EVENT_TYPES = [
  'run.start',
  'stage.start',
  'stage.end',
  'model.usage',
  'tool.call',
  'tool.result',
  'gate.check',
  'run.end',
  'run.error',
  'raw',
] as const;

export type TraceEventType = (typeof TRACE_EVENT_TYPES)[number];

export function isTraceEventType(value: unknown): value is TraceEventType {
  return (
    typeof value === 'string' &&
    (TRACE_EVENT_TYPES as readonly string[]).includes(value)
  );
}

/** 事件来源：谁产生的这条事实 */
export const TRACE_SOURCES = ['api', 'dsh', 'publish'] as const;
export type TraceSource = (typeof TRACE_SOURCES)[number];

/** 运行类别（run.start.payload.kind） */
export const TRACE_RUN_KINDS = ['agent', 'assistant', 'publish'] as const;
export type TraceRunKind = (typeof TRACE_RUN_KINDS)[number];

/** 甘特图阶段词表（stage.start / stage.end 的 payload.stage） */
export const TRACE_STAGES = ['input', 'model', 'tool', 'persist'] as const;
export type TraceStage = (typeof TRACE_STAGES)[number];

/** 运行终态（run.end / run.error 的 payload.status） */
export const TRACE_RUN_STATUSES = ['SUCCESS', 'FAILED'] as const;
export type TraceRunStatus = (typeof TRACE_RUN_STATUSES)[number];

/** 门禁词表（gate.check 的 payload.gate） */
export const TRACE_GATES = ['published-fields', 'geo'] as const;
export type TraceGate = (typeof TRACE_GATES)[number];

/* ========== payload 类型（TECH-DESIGN §4.2 逐项对齐） ========== */

export interface RunStartPayload {
  kind: TraceRunKind;
  agentId?: string;
  target?: string;
}

export interface StageStartPayload {
  stage: TraceStage;
  label: string;
}

export interface StageEndPayload {
  stage: TraceStage;
  elapsedMs: number;
  /** 各阶段自有度量（fileBytes / tokens / answerChars 等），读取方忽略未知字段 */
  data: Record<string, unknown>;
}

export interface ModelUsagePayload {
  model: string;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
}

export interface ToolCallPayload {
  tool: string;
  /** 参数哈希，不是原文（正文不进轨迹） */
  paramsHash: string;
}

export interface ToolResultPayload {
  tool: string;
  ok: boolean;
  outputBytes: number;
}

export interface GateCheckPayload {
  gate: TraceGate;
  ok: boolean;
  missing: string[];
}

export interface RunEndPayload {
  status: TraceRunStatus;
  elapsedMs: number;
  metrics: Record<string, unknown>;
}

export interface RunErrorPayload {
  status: 'FAILED';
  code: string;
  /** 截断后的错误信息（写入方负责截断） */
  message: string;
  exitCode?: number;
}

export interface RawPayload {
  line: string;
}

/** 各类型 payload 的对应表（事件类型 → payload 形状的唯一来源） */
export interface TracePayloadByType {
  'run.start': RunStartPayload;
  'stage.start': StageStartPayload;
  'stage.end': StageEndPayload;
  'model.usage': ModelUsagePayload;
  'tool.call': ToolCallPayload;
  'tool.result': ToolResultPayload;
  'gate.check': GateCheckPayload;
  'run.end': RunEndPayload;
  'run.error': RunErrorPayload;
  raw: RawPayload;
}

/** 通用信封（TECH-DESIGN §4.1） */
export interface TraceEvent<T extends TraceEventType = TraceEventType> {
  /** 契约版本，读取方按版本分支 */
  v: number;
  /** 单调递增游标，从 1 开始；缺 seq 的历史/兜底事件为 0（不参与游标推进） */
  seq: number;
  /** 事件发生时刻（ms） */
  ts: number;
  runId: string;
  type: T;
  source: TraceSource;
  payload: TracePayloadByType[T];
}

/**
 * 规范化结果：v1 已知类型给完整信封；未知 type / 未知 v 保留原文（不崩、不丢）。
 * 两者形状一致，消费方按 isTraceEventType(e.type) 分支。
 */
export type NormalizedTraceEvent = TraceEvent | {
  v: number;
  seq: number;
  ts: number;
  runId: string;
  type: string;
  source: string;
  payload: unknown;
};

/** 旧事件兼容映射（TECH-DESIGN §4.3）：历史行不迁移，读侧统一适配 */
const LEGACY_EVENT_TO_TYPE = {
  start: 'run.start',
  done: 'run.end',
  error: 'run.error',
} as const;

/** 旧 stage 事件里只有 input/model 两档，规范化为 stage.end */
const LEGACY_STAGES = ['input', 'model'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 旧 start → run.start：kind 恒为 'agent'（旧写入器只有 agent 直调一条路径） */
function normalizeLegacyStart(obj: Record<string, unknown>): TraceEvent<'run.start'> {
  return {
    v: TRACE_CONTRACT_VERSION,
    seq: 0,
    ts: asNumber(obj.timestamp),
    runId: asString(obj.runId),
    type: 'run.start',
    source: 'api',
    payload: {
      kind: 'agent',
      ...(typeof obj.agentId === 'string' ? { agentId: obj.agentId } : {}),
      ...(typeof obj.targetFile === 'string' ? { target: obj.targetFile } : {}),
    },
  };
}

/** 旧 stage → stage.end：stage/elapsedMs/data 平移，label 并入 data 保留 */
function normalizeLegacyStage(obj: Record<string, unknown>): TraceEvent<'stage.end'> {
  const stage = obj.stage as TraceStage;
  const data: Record<string, unknown> = isRecord(obj.data) ? { ...obj.data } : {};
  if (typeof obj.label === 'string' && data.label === undefined) {
    data.label = obj.label;
  }
  return {
    v: TRACE_CONTRACT_VERSION,
    seq: 0,
    ts: asNumber(obj.timestamp),
    runId: asString(obj.runId),
    type: 'stage.end',
    source: 'api',
    payload: {
      stage,
      elapsedMs: asNumber(obj.elapsedMs),
      data,
    },
  };
}

/** 旧 done → run.end */
function normalizeLegacyDone(obj: Record<string, unknown>): TraceEvent<'run.end'> {
  return {
    v: TRACE_CONTRACT_VERSION,
    seq: 0,
    ts: asNumber(obj.timestamp),
    runId: asString(obj.runId),
    type: 'run.end',
    source: 'api',
    payload: {
      status: obj.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
      elapsedMs: asNumber(obj.elapsedMs),
      metrics: isRecord(obj.metrics) ? obj.metrics : {},
    },
  };
}

/** 旧 error → run.error：旧事件只有 message（error 字段），code 记 'legacy-error' */
function normalizeLegacyError(obj: Record<string, unknown>): TraceEvent<'run.error'> {
  return {
    v: TRACE_CONTRACT_VERSION,
    seq: 0,
    ts: asNumber(obj.timestamp),
    runId: asString(obj.runId),
    type: 'run.error',
    source: 'api',
    payload: {
      status: 'FAILED',
      code: 'legacy-error',
      message: asString(obj.error),
    },
  };
}

/**
 * 把任意已解析的 JSON 值规范化为 v1 信封。
 * - 旧事件（start / stage{input|model} / done / error）按 §4.3 映射，历史行不改写。
 * - v1 已知类型：补齐缺省字段（缺 seq 记 0），payload 原样透传（忽略未知字段）。
 * - v 不匹配或 type 未知：保留原文不崩，消费方自行分支。
 * - 非对象输入：降级为 raw 形状。
 */
export function normalizeTraceEvent(input: unknown): NormalizedTraceEvent {
  if (!isRecord(input)) {
    return {
      v: TRACE_CONTRACT_VERSION,
      seq: 0,
      ts: 0,
      runId: '',
      type: 'raw',
      source: 'api',
      payload: { line: String(input ?? '') },
    };
  }

  // 旧事件（无 v、以 event 为类型键）走兼容映射
  if (typeof input.event === 'string' && input.v === undefined) {
    if (input.event === 'start') return normalizeLegacyStart(input);
    if (
      input.event === 'stage' &&
      (LEGACY_STAGES as readonly string[]).includes(asString(input.stage))
    ) {
      return normalizeLegacyStage(input);
    }
    if (input.event === 'done') return normalizeLegacyDone(input);
    if (input.event === 'error') return normalizeLegacyError(input);
    // 未识别的旧事件：保留原文，不强行解释
    return preserveUnknown(input);
  }

  // v 不匹配：本读取方只理解 v1，保留原文分支（TECH-DESIGN §10：按 v 分支，历史不迁移）
  if (input.v !== undefined && input.v !== TRACE_CONTRACT_VERSION) {
    return preserveUnknown(input);
  }

  // v1（或缺 v 但走新信封字段）已知类型：补 envelope 缺省，payload 透传
  if (isTraceEventType(input.type)) {
    return {
      v: TRACE_CONTRACT_VERSION,
      seq: asNumber(input.seq),
      ts: asNumber(input.ts),
      runId: asString(input.runId),
      type: input.type,
      source: (TRACE_SOURCES as readonly string[]).includes(asString(input.source))
        ? (input.source as TraceSource)
        : 'api',
      payload: (input.payload ?? {}) as TracePayloadByType[TraceEventType],
    };
  }

  // 未知 type：保留原文不崩（读在前写在后，新写入方的类型旧前端也能安全展示）
  return preserveUnknown(input);
}

/** 未知 / 高版本事件：尽力抽出信封字段，其余原样保留 */
function preserveUnknown(obj: Record<string, unknown>): NormalizedTraceEvent {
  return {
    v: asNumber(obj.v),
    seq: asNumber(obj.seq),
    ts: asNumber(obj.ts ?? obj.timestamp),
    runId: asString(obj.runId),
    type: asString(obj.type ?? obj.event, 'unknown'),
    source: asString(obj.source, 'unknown'),
    payload: obj.payload ?? obj,
  };
}

/**
 * 解析一行 jsonl。
 * - 空白行返回 null（调用方过滤，不算坏行）。
 * - 解析失败的行降级为 { type:'raw', payload:{ line } }（沿用 agent-runner 既有兜底范式）。
 * - 解析成功的行经 normalizeTraceEvent 统一出口（旧事件兼容、未知 type 容错都覆盖）。
 */
export function parseTraceLine(line: string): NormalizedTraceEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      v: TRACE_CONTRACT_VERSION,
      seq: 0,
      ts: 0,
      runId: '',
      type: 'raw',
      source: 'api',
      payload: { line: trimmed },
    };
  }
  return normalizeTraceEvent(parsed);
}
