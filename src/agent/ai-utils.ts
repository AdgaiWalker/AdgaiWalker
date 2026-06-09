/**
 * AI 响应解析工具
 *
 * 参考 NorthStar shared/ai-utils.ts 的容错解析模式：
 * - 从可能包含非 JSON 文本的响应中提取 JSON 子串
 * - 多策略容错解析（双花括号、前后缀噪声等）
 * - 安全的类型检查工具
 */

/** 从可能包含非 JSON 文本的响应中提取 JSON 子串 */
export function extractLikelyJson(text: string): string {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return text;
  return text.slice(first, last + 1);
}

/** 安全解析 JSON，尝试多种容错策略 */
export function safeParseJsonObject(raw: string): unknown {
  const base = extractLikelyJson(String(raw || '')).trim();
  const candidates: string[] = [];

  if (base) candidates.push(base);
  if (base.startsWith('{{')) candidates.push(base.slice(1));
  if (base.endsWith('}}')) candidates.push(base.slice(0, -1));
  if (base.startsWith('{{') && base.endsWith('}}')) candidates.push(base.slice(1, -1));

  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // try next
    }
  }

  try {
    return JSON.parse(base || '{}');
  } catch {
    return {};
  }
}

/** 类型守卫：判断值是否为普通对象 */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** 将各种格式的值规范化为 string[] */
export function normalizeStringArray(value: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown) => {
    if (typeof v === 'string') {
      const s = v.trim();
      if (s) out.push(s);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) visit(item);
      return;
    }
    if (v == null) return;
    const s = String(v).trim();
    if (s) out.push(s);
  };
  visit(value);
  return out;
}
