/**
 * 站内助手 Run 合同 v1（纯函数层，无 React / 无 IO）。
 * AI 产出的回答必须经 parseAssistantOutput 校验才允许出网关；
 * citations 只接受 citable 集合内的 slug（fail-closed，PRD 非协商第 3 条）。
 */

export interface AssistantCitation {
  slug: string;
}

export interface AssistantRunResult {
  answer: string;
  citations: AssistantCitation[];
  sessionId: string;
  turnId?: string | null;
  aiUsedFlag: boolean;
  elapsedMs: number;
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
 * 校验模型输出。answer 不合法返回 null（调用方走规则兜底）；
 * citation 不在 citable 集合内的直接丢弃，不拒收整体。
 */
export function parseAssistantOutput(
  raw: unknown,
  citableSlugs: ReadonlySet<string>,
): AiAssistantOutput | null {
  let candidate = raw;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== 'object') return null;
  const obj = candidate as Record<string, unknown>;
  if (typeof obj.answer !== 'string') return null;
  const answer = sanitizeAnswerText(obj.answer);
  if (
    answer.length < ASSISTANT_ANSWER_MIN_LENGTH ||
    answer.length > ASSISTANT_ANSWER_MAX_LENGTH
  ) {
    return null;
  }
  const seen = new Set<string>();
  const citations: AssistantCitation[] = [];
  for (const slug of extractCitationSlugs(obj.citations)) {
    if (!citableSlugs.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    citations.push({ slug });
    if (citations.length >= ASSISTANT_MAX_CITATIONS) break;
  }
  return { answer, citations };
}
