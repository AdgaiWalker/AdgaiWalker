/**
 * 站内助手 Run 合同 v1（纯函数层，无 React / 无 IO）。
 * AI 产出的回答必须经 parseAssistantOutput 校验才允许出网关；
 * citations 只接受 citable 集合内的 slug（fail-closed，PRD 非协商第 3 条）。
 */

export interface AssistantCitation {
  slug: string;
}

/** 观测 P1：token 用量（多 step 求和；缺失记 0，不记 null） */
export interface AssistantTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}

/**
 * 观测 P1：降级原因词表（kebab，与 FeatureEvent failCode 同风格）。
 * 正常 AI 回答为 null；每个词与一处兜底路径一一对应。
 */
export const DEGRADE_REASONS = [
  'ai-disabled',
  'budget-exceeded',
  'timeout',
  'client-abort',
  'queue-full',
  'queue-deadline',
  'bad-output',
  'runtime-error',
] as const;

export type DegradeReason = (typeof DEGRADE_REASONS)[number];

export function isDegradeReason(value: unknown): value is DegradeReason {
  return (
    typeof value === 'string' &&
    (DEGRADE_REASONS as readonly string[]).includes(value)
  );
}

export interface AssistantRunResult {
  answer: string;
  citations: AssistantCitation[];
  sessionId: string;
  turnId?: string | null;
  aiUsedFlag: boolean;
  elapsedMs: number;
  /** 观测 P1：token 用量（规则兜底不带） */
  usage?: AssistantTokenUsage;
  /** 观测 P1：拿锁 → 首个回答增量的耗时 */
  firstChunkMs?: number;
  /** 观测 P1：排队等待耗时 */
  queueWaitMs?: number;
  /** 观测 P1：降级原因（正常 AI 回答为 null） */
  degradeReason?: DegradeReason | null;
}

export interface AiAssistantOutput {
  answer: string;
  citations: AssistantCitation[];
}

export const ASSISTANT_ANSWER_MIN_LENGTH = 4;
export const ASSISTANT_ANSWER_MAX_LENGTH = 1200;
export const ASSISTANT_MAX_CITATIONS = 3;

/** 助手提问最短：trim 后 ≥ 2（对话语境，中文两字即成句；与卡口 4 字规则解耦） */
export const ASSISTANT_BODY_MIN_LENGTH = 2;

export function isValidAssistantBody(body: string): boolean {
  return body.trim().length >= ASSISTANT_BODY_MIN_LENGTH;
}

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\([^)]*\)/g;

/** 回答以纯文本渲染：折叠 markdown 链接为文字、去尖括号、压多余空行 */
export function sanitizeAnswerText(raw: string): string {
  return raw
    .replace(MARKDOWN_LINK_RE, '$1')
    .replace(/[<>]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * 从流式累积的模型 JSON 输出中提取 answer 字段已闭合的文本（服务端与浏览器共用）。
 * 这是流式展示合同：text-delta 流的是 JSON 原文，出网关 / 进浏览器前必须裁剪成
 * 纯答案文本——citations 数组、JSON 语法噪声一律不外发。终值仍由 parseAssistantOutput
 * 完整校验并整体覆盖，本函数只服务流式期间的干净显示。容忍 `"answer" : "` 的空白变体。
 */
export function extractStreamedAnswer(buffer: string): string {
  const startMatch = buffer.match(/"answer"\s*:\s*"/);
  if (!startMatch || startMatch.index === undefined) return '';
  let i = startMatch.index + startMatch[0].length;
  let out = '';
  while (i < buffer.length) {
    const ch = buffer[i];
    if (ch === '\\' && i + 1 < buffer.length) {
      const next = buffer[i + 1];
      if (next === 'n') out += '\n';
      else if (next === '"') out += '"';
      else if (next === '\\') out += '\\';
      else if (next === 'r') out += '';
      else if (next === 't') out += '\t';
      else out += ch + next;
      i += 2;
      continue;
    }
    if (ch === '"') break; // answer 值闭合，其后（citations 等）不外发
    out += ch;
    i += 1;
  }
  return out;
}

function extractCitationSlugs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const slugs: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      slugs.push(entry);
    } else if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as { slug?: unknown }).slug === 'string'
    ) {
      slugs.push((entry as { slug: string }).slug);
    }
  }
  return slugs;
}

/**
 * 从模型输出里**尽力**取出一个 JSON 对象。
 *
 * 为什么必须容错：提示词已经要求「只输出一个 JSON 对象」，但模型经常
 * 加 markdown 围栏（```json … ```）或前后夹一句「好的，我来回答：」。
 * 严格 `JSON.parse` 会把这类**内容完全正确**的输出判成 bad-output 而整轮降级 ——
 * 实测小影就长期因此走规则兜底。这里按「围栏 → 首尾大括号」的次序退让，
 * 但仍然**只接受能解析出的对象**，不把散文当合同。
 */
function extractJsonObject(text: string): unknown | null {
  const tryParse = (candidate: string): unknown | null => {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  };

  const trimmed = text.trim();
  const direct = tryParse(trimmed);
  if (direct !== null) return direct;

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) {
    const inner = tryParse(fenced[1].trim());
    if (inner !== null) return inner;
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const sliced = tryParse(trimmed.slice(start, end + 1));
    if (sliced !== null) return sliced;
  }
  return null;
}

export type AssistantOutputDiagnosis =
  | { ok: true; value: AiAssistantOutput }
  | { ok: false; reason: string; preview: string };

/**
 * 校验模型输出，并**说清失败原因**（同一条规则的唯一实现，`parseAssistantOutput` 委托它）。
 *
 * 只回 null 的旧形态让线上只剩一句「没过合同校验」，无法判断是模型没给 JSON、
 * 还是 answer 超长 —— 排查只能靠猜。原因里带上实测长度，降级日志才有信息量。
 */
export function diagnoseAssistantOutput(
  raw: unknown,
  citableSlugs: ReadonlySet<string>,
): AssistantOutputDiagnosis {
  const preview = (
    typeof raw === 'string' ? raw : (JSON.stringify(raw) ?? String(raw ?? ''))
  ).slice(0, 200);

  let candidate = raw;
  if (typeof candidate === 'string') {
    const extracted = extractJsonObject(candidate);
    if (extracted === null) {
      return { ok: false, reason: '无法从输出中提取 JSON 对象', preview };
    }
    candidate = extracted;
  }
  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, reason: '输出不是对象（既不是 JSON，也不是 JSON 字符串）', preview };
  }

  const obj = candidate as Record<string, unknown>;
  if (typeof obj.answer !== 'string') {
    return { ok: false, reason: '缺 answer 字段（或不是字符串）', preview };
  }
  const answer = sanitizeAnswerText(obj.answer);
  if (answer.length < ASSISTANT_ANSWER_MIN_LENGTH) {
    return {
      ok: false,
      reason: `answer 过短（${answer.length} < ${ASSISTANT_ANSWER_MIN_LENGTH}）`,
      preview,
    };
  }
  if (answer.length > ASSISTANT_ANSWER_MAX_LENGTH) {
    return {
      ok: false,
      reason: `answer 过长（${answer.length} > ${ASSISTANT_ANSWER_MAX_LENGTH}）`,
      preview,
    };
  }

  const seen = new Set<string>();
  const citations: AssistantCitation[] = [];
  for (const slug of extractCitationSlugs(obj.citations)) {
    if (!citableSlugs.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    citations.push({ slug });
    if (citations.length >= ASSISTANT_MAX_CITATIONS) break;
  }
  return { ok: true, value: { answer, citations } };
}

/**
 * 校验模型输出。answer 不合法返回 null（调用方走规则兜底）；
 * citation 不在 citable 集合内的直接丢弃，不拒收整体。
 */
export function parseAssistantOutput(
  raw: unknown,
  citableSlugs: ReadonlySet<string>,
): AiAssistantOutput | null {
  const diagnosis = diagnoseAssistantOutput(raw, citableSlugs);
  return diagnosis.ok ? diagnosis.value : null;
}
