import { describe, expect, it } from 'vitest';
import {
  FIRST_TURN_MIN_SCORE,
  entryRelevance,
  packFirstTurnContext,
  questionTerms,
  type GroundedEntry,
} from './assistant-context';

const entries: GroundedEntry[] = [
  {
    slug: 'ai-low-cost-access',
    title: '我每个月在 AI 模型上的花销，不到正常价格的三分之一',
    tags: ['AI', '学生', '方法论', '省钱'],
    summary: '闲鱼成品号、跨区兑换、合约窗口——三个渠道让我用很低的价格用到 GPT、Grok、Gemini。',
    body: '正常渠道一个月要一两百。我实际花的，不到三分之一。',
  },
  {
    slug: 'apple-pay-cross-region',
    title: '我用 Apple Pay 跨区买海外 AI 会员，比国内便宜一半',
    tags: ['AI', '学生', '教程', '省钱'],
    summary: '注册外区 Apple ID → 充值 → 在 App 里付。',
    body: '苹果各国区账号注册方便，Apple Pay 直接付。',
  },
  {
    slug: 'ferry-theory',
    title: '渡口理论',
    tags: ['思考'],
    summary: '船与停靠的比喻。',
    body: '每一次停靠都有代价。',
  },
];

describe('首轮上下文打包（整库倾泻 → 目录 + 相关正文）', () => {
  it('目录永远完整：不管问题是什么，每一条都在', () => {
    for (const question of ['我每个月在 AI 模型上的花销大概是多少？', '你是什么模型', '你好']) {
      const packed = packFirstTurnContext(entries, question);
      for (const entry of entries) expect(packed.index).toContain(entry.slug);
    }
  });

  it('问题明确指向某篇时，附带该篇正文并在目录里标注', () => {
    const packed = packFirstTurnContext(entries, '我每个月在 AI 模型上的花销大概是多少？');
    // 排第一的必须是真正对题的那篇；提到 AI 的省钱文章一起给是合理相关
    expect(packed.includedSlugs[0]).toBe('ai-low-cost-access');
    expect(packed.includedSlugs).toContain('apple-pay-cross-region');
    expect(packed.includedSlugs).not.toContain('ferry-theory');
    expect(packed.bodies).toContain('不到三分之一');
    expect(packed.index).toContain('ai-low-cost-access｜标题');
    expect(packed.index).toContain('正文见下');
    // 无关条目只出现在目录里，正文不夹带
    expect(packed.index).toContain('ferry-theory');
    expect(packed.bodies).not.toContain('渡口');
  });

  it('没有相关条目时只给目录——首轮不带垃圾正文', () => {
    const packed = packFirstTurnContext(entries, '今天天气怎么样');
    expect(packed.includedSlugs).toEqual([]);
    expect(packed.bodies).toBe('');
  });

  it('条数上限之外的相关条目如实记进 omittedSlugs，不假装给了', () => {
    const packed = packFirstTurnContext(entries, 'AI 花销 省钱 便宜 渠道', { maxBodies: 1 });
    expect(packed.includedSlugs).toHaveLength(1);
    expect(packed.omittedSlugs.length).toBeGreaterThan(0);
    for (const slug of packed.omittedSlugs) expect(packed.bodies).not.toContain(slug);
  });

  it('字符预算挡住的条目同样如实记录', () => {
    const packed = packFirstTurnContext(entries, 'AI 花销 省钱 便宜 渠道', { bodyBudget: 40 });
    expect(packed.includedSlugs).toHaveLength(1);
    expect(packed.omittedSlugs.length).toBeGreaterThan(0);
  });

  it('同一输入永远给同一结果（确定性，便于回归）', () => {
    const a = packFirstTurnContext(entries, '怎么做跨区买 AI 会员？');
    const b = packFirstTurnContext(entries, '怎么做跨区买 AI 会员？');
    expect(a).toEqual(b);
    // 跨区那篇排第一（命中更多）；花销那篇同样提到 AI 会员，属于合理相关，一起给
    expect(a.includedSlugs).toEqual(['apple-pay-cross-region', 'ai-low-cost-access']);
  });

  it('词元与打分是纯函数：汉字取二元组、拉丁取整词；标题/标签命中是摘要的两倍', () => {
    const terms = questionTerms('Apple Pay 跨区');
    expect(terms).toContain('apple');
    expect(terms).toContain('pay');
    expect(terms).toContain('跨区');
    // 「花销」在标题、「省钱」在标签 → 各记 2 分
    expect(entryRelevance(entries[0]!, ['花销', '省钱'])).toBe(4);
    // 摘要命中只记 1 分；完全不命中记 0
    expect(entryRelevance(entries[0]!, ['闲鱼'])).toBe(1);
    expect(entryRelevance(entries[2]!, ['花销'])).toBe(0);
    expect(FIRST_TURN_MIN_SCORE).toBe(2);
  });
});
