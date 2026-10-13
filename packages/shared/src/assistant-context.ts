/**
 * 访客助手首轮上下文的**唯一打包规则**（服务端与测试共用）。
 *
 * 为什么需要它：首轮以前把整库正文（28 篇 ≈ 3.4 万字）整包塞进提示词，等于用
 * 「全量倾泻」代替「取数」。实测同一句话首轮 6.4–7.9 秒、同会话第二轮 1.9 秒——
 * 差的就是这 1.9 万 token 的前缀。站点只要再长 10 倍，这条路必然塌。
 *
 * 现在的结构分两层：
 *   目录：**永远全量**（slug/标题/标签/摘要）。助手永远知道站点有什么，引用不会漏。
 *   正文：**只在问题明确指向某几篇时附带**，有阈值、有条数上限、有字符预算三重闸。
 *
 * 关键词命中只在高信号字段（标题/标签/摘要/slug）上算：正文里数字符命中会把
 * 「的/在/是」这类噪声算进去，实测选出来的全是无关文章——宁可不给正文，也不给错正文。
 */

/** 参与打包的条目：只要四个字段，不与任何存储实现耦合。 */
export interface GroundedEntry {
  slug: string;
  title: string;
  tags: readonly string[];
  summary: string;
  body: string;
}

export interface FirstTurnContext {
  /** 全站目录（每条一行），永远完整。 */
  index: string;
  /** 相关正文段落；没有相关条目时为空字符串。 */
  bodies: string;
  /** 实际附带正文的 slug（按相关度排序）——日志与测试据此核对。 */
  includedSlugs: string[];
  /** 相关但被条数/预算挡在外的 slug——如实记录，不假装全给了。 */
  omittedSlugs: string[];
}

export interface PackFirstTurnContextOptions {
  /** 附带的正文条数上限 */
  maxBodies?: number;
  /** 附带正文的总字符预算 */
  bodyBudget?: number;
  /** 命中阈值：低于它的条目视为「不相关」，不附正文（目录里仍然有） */
  minScore?: number; // 默认 2 = 标题/标签/slug 命中一次，或摘要命中两次
}

export const FIRST_TURN_MAX_BODIES = 6;
export const FIRST_TURN_BODY_BUDGET_CHARS = 8_000;
export const FIRST_TURN_MIN_SCORE = 2;

/**
 * 把问题切成可比较的词元：拉丁/数字词整词 + 汉字二元组。
 * 没有分词器也能用，且**确定性**——同样的输入永远给同样的选择。
 */
export function questionTerms(question: string): string[] {
  const terms = new Set<string>();
  for (const word of question.match(/[A-Za-z0-9]+/g) ?? []) {
    if (word.length > 1) terms.add(word.toLowerCase());
  }
  for (const run of question.match(/[\u4e00-\u9fff]+/g) ?? []) {
    for (let i = 0; i + 1 < run.length; i += 1) terms.add(run.slice(i, i + 2));
  }
  return [...terms];
}

/**
 * 相关度打分：标题 / 标签 / slug 命中记 2 分，摘要命中记 1 分（一个词只记一次）。
 *
 * 为什么加权而不是数命中次数：正文里数命中会被「的/在/是」这类高频二元组带偏，
 * 实测选出来的全是无关文章。高信号字段命中才是真的相关——宁可少给，不给错。
 * 比较前统一小写，否则「GPT」这种大写写法会把提问里的 gpt 漏掉。
 */
export function entryRelevance(entry: GroundedEntry, terms: readonly string[]): number {
  const strong = `${entry.slug} ${entry.title} ${entry.tags.join(' ')}`.toLowerCase();
  const weak = entry.summary.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (strong.includes(term)) score += 2;
    else if (weak.includes(term)) score += 1;
  }
  return score;
}

function indexLine(entry: GroundedEntry, hasBody: boolean): string {
  const tags = entry.tags.length ? `｜标签: ${entry.tags.join(' ')}` : '';
  return `- slug: ${entry.slug}｜标题: ${entry.title}${tags}｜摘要: ${entry.summary}${hasBody ? '｜正文见下' : ''}`;
}

export function packFirstTurnContext(
  entries: readonly GroundedEntry[],
  question: string,
  options: PackFirstTurnContextOptions = {},
): FirstTurnContext {
  const maxBodies = options.maxBodies ?? FIRST_TURN_MAX_BODIES;
  const bodyBudget = options.bodyBudget ?? FIRST_TURN_BODY_BUDGET_CHARS;
  const minScore = options.minScore ?? FIRST_TURN_MIN_SCORE;

  const terms = questionTerms(question);
  // 稳定排序：同分保持原顺序（等于快照顺序），不引入随机性。
  const ranked = entries
    .map((entry, order) => ({ entry, order, score: entryRelevance(entry, terms) }))
    .sort((a, b) => (b.score - a.score) || (a.order - b.order));

  const included: GroundedEntry[] = [];
  const omitted: string[] = [];
  let used = 0;
  for (const { entry, score } of ranked) {
    if (score < minScore) break;
    if (included.length >= maxBodies) { omitted.push(entry.slug); continue; }
    const cost = entry.body.length + entry.title.length + entry.slug.length + 24;
    if (used + cost > bodyBudget && included.length > 0) { omitted.push(entry.slug); continue; }
    included.push(entry);
    used += cost;
  }

  const includedSlugs = new Set(included.map((entry) => entry.slug));
  const index = entries.map((entry) => indexLine(entry, includedSlugs.has(entry.slug))).join('\n');
  const bodies = included
    .map((entry) => `- slug: ${entry.slug}｜标题: ${entry.title}\n${entry.body}`)
    .join('\n\n');

  return { index, bodies, includedSlugs: [...includedSlugs], omittedSlugs: omitted };
}
