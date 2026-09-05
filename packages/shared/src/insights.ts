/**
 * 需求信号分析纯函数（无 React / 无 IO）。
 * 四源信号：问了小影 / 卡口提问 / 搜索没找到 / 文章反馈。
 * 语言原则：零比喻——需求、问题、搜索、反馈、选题。
 */

export type DemandSignalSource =
  | 'assistant' // 问了小影
  | 'intake' // 卡口提问
  | 'search-miss' // 搜索没找到
  | 'feedback'; // 文章反馈（需补充）

export const DEMAND_SIGNAL_LABELS: Record<DemandSignalSource, string> = {
  assistant: '问了小影',
  intake: '卡口提问',
  'search-miss': '搜索没找到',
  feedback: '文章反馈',
} as const;

export interface DemandSignal {
  id: string;
  source: DemandSignalSource;
  text: string;
  /** feedback 专属：哪篇文章 */
  contentId?: string;
  createdAt: string;
}

/** 轻量归一化：trim + 小写 + 去标点空白——足够量级内的频次统计，不做模糊聚类 */
export function normalizeForCounting(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s，。？！、,.?!~～：:;；"'「」【】()（）]/g, '')
    .trim();
}

export interface FrequencyItem {
  normalized: string;
  /** 展示用的代表原文（取最长一条，信息最全） */
  display: string;
  count: number;
  sources: DemandSignalSource[];
}

/** 高频问题榜：归一化计数，取代表原文，跨来源合并 */
export function countFrequency(
  signals: readonly DemandSignal[],
  limit = 20,
): FrequencyItem[] {
  const map = new Map<
    string,
    { display: string; count: number; sources: Set<DemandSignalSource> }
  >();
  for (const s of signals) {
    if (s.source === 'feedback') continue; // 反馈是评价不是问题，不入高频榜
    const key = normalizeForCounting(s.text);
    if (!key || key.length < 2) continue;
    const cur = map.get(key) ?? {
      display: s.text,
      count: 0,
      sources: new Set<DemandSignalSource>(),
    };
    cur.count += 1;
    cur.sources.add(s.source);
    if (s.text.length > cur.display.length) cur.display = s.text;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([normalized, v]) => ({
      normalized,
      display: v.display,
      count: v.count,
      sources: [...v.sources],
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface ContentGapItem {
  query: string;
  count: number;
  /** 站内是否有对应内容（标题/标签含关键词的简单匹配） */
  covered: boolean;
  /** 命中的站内标题 */
  matchedTitles: string[];
}

/** 内容缺口：搜索 miss 对照站内标题/标签，未覆盖的词 = 最直接的「该写什么」证据 */
export function findContentGaps(
  missQueries: readonly { query: string; count: number }[],
  contentTitles: readonly { title: string; tags: string[] }[],
  limit = 20,
): ContentGapItem[] {
  const haystacks = contentTitles.map((c) => ({
    title: c.title,
    text: normalizeForCounting(c.title + (c.tags ?? []).join('')),
  }));
  return missQueries
    .map((q) => {
      // 按词匹配：查询拆词后每个词都能在标题/标签中找到才算已覆盖
      const words = q.query
        .split(/[\s，。？！、,.?!]+/)
        .map(normalizeForCounting)
        .filter((w) => w.length >= 2);
      if (!words.length) return null;
      const matched = haystacks.filter((h) =>
        words.every((w) => h.text.includes(w)),
      );
      return {
        query: q.query,
        count: q.count,
        covered: matched.length > 0,
        matchedTitles: matched.slice(0, 3).map((m) => m.title),
      };
    })
    .filter((x): x is ContentGapItem => x !== null)
    .sort((a, b) => Number(a.covered) - Number(b.covered) || b.count - a.count)
    .slice(0, limit);
}

/** ── 需求周报（分析 Run 的输出合同）── **/

export type InsightSuggestionKind =
  | 'write' // 写文章
  | 'build' // 做产品
  | 'post' // 自媒体选题
  | 'business'; // 商业信号

export const INSIGHT_SUGGESTION_LABELS: Record<InsightSuggestionKind, string> =
  {
    write: '写文章',
    build: '做产品',
    post: '自媒体选题',
    business: '商业信号',
  } as const;

export interface InsightTheme {
  title: string;
  count: number;
  examples: string[];
}

export interface InsightSuggestion {
  kind: InsightSuggestionKind;
  text: string;
  /** 依据的信号原文（可追溯） */
  evidence: string;
}

export interface InsightReportData {
  themes: InsightTheme[];
  gaps: string[];
  suggestions: InsightSuggestion[];
  /** 一段直白的总结 */
  summary: string;
}

/** 校验分析 Run 的 JSON 输出；不合法返回 null（调用方拒收，不落库） */
export function parseInsightReport(raw: unknown): InsightReportData | null {
  let candidate = raw;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== 'object') return null;
  const o = candidate as Record<string, unknown>;
  if (typeof o.summary !== 'string' || !o.summary.trim()) return null;
  if (!Array.isArray(o.themes) || !Array.isArray(o.gaps) || !Array.isArray(o.suggestions)) {
    return null;
  }
  const themes: InsightTheme[] = [];
  for (const t of o.themes.slice(0, 10)) {
    if (!t || typeof t !== 'object') continue;
    const { title, count, examples } = t as Record<string, unknown>;
    if (typeof title !== 'string' || !title.trim()) continue;
    themes.push({
      title,
      count: Number.isFinite(Number(count)) ? Number(count) : 1,
      examples: Array.isArray(examples)
        ? examples.filter((e): e is string => typeof e === 'string').slice(0, 3)
        : [],
    });
  }
  if (!themes.length) return null;
  const suggestions: InsightSuggestion[] = [];
  for (const s of o.suggestions.slice(0, 10)) {
    if (!s || typeof s !== 'object') continue;
    const { kind, text, evidence } = s as Record<string, unknown>;
    if (typeof text !== 'string' || !text.trim()) continue;
    if (!(kind in INSIGHT_SUGGESTION_LABELS)) continue;
    suggestions.push({
      kind: kind as InsightSuggestionKind,
      text,
      evidence: typeof evidence === 'string' ? evidence : '',
    });
  }
  return {
    themes,
    gaps: o.gaps.filter((g): g is string => typeof g === 'string').slice(0, 10),
    suggestions,
    summary: o.summary.trim().slice(0, 500),
  };
}
