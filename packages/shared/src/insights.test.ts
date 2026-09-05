import { describe, expect, it } from 'vitest';
import {
  countFrequency,
  findContentGaps,
  normalizeForCounting,
  type DemandSignal,
} from './insights.js';

const sig = (
  id: string,
  source: DemandSignal['source'],
  text: string,
): DemandSignal => ({ id, source, text, createdAt: '2026-09-05T00:00:00Z' });

describe('需求信号频次', () => {
  it('归一化合并同题（标点/大小写/空白不敏感），代表原文取最长', () => {
    const out = countFrequency([
      sig('1', 'assistant', '想学 AI 从哪开始？'),
      sig('2', 'assistant', '想学ai从哪开始'),
      sig('3', 'intake', '想学 AI 从哪开始！'),
    ]);
    expect(out[0]?.count).toBe(3);
    expect(out[0]?.display).toBe('想学 AI 从哪开始？');
    expect(out[0]?.sources).toEqual(
      expect.arrayContaining(['assistant', 'intake']),
    );
  });

  it('反馈不入榜；过短文本忽略', () => {
    const out = countFrequency([
      sig('1', 'feedback', '想学 AI'),
      sig('2', 'assistant', '好'),
    ]);
    expect(out).toHaveLength(0);
  });
});

describe('内容缺口', () => {
  it('miss 词命中站内标题判为已覆盖，未命中排前', () => {
    const gaps = findContentGaps(
      [
        { query: 'macbook 闲鱼', count: 3 },
        { query: 'foobarbaz 完全没有的内容', count: 1 },
      ],
      [{ title: '我的 MacBook M1 Pro 是花 2800 块在闲鱼上买的', tags: ['省钱'] }],
    );
    const uncovered = gaps.find((g) => !g.covered);
    expect(uncovered?.query).toContain('foobarbaz');
    const covered = gaps.find((g) => g.covered);
    expect(covered?.matchedTitles[0]).toContain('MacBook');
  });
});

describe('归一化', () => {
  it('去标点空白小写', () => {
    expect(normalizeForCounting('  你好，World！  ')).toBe('你好world');
  });
});

import { parseInsightReport } from './insights.js';

describe('需求周报合同', () => {
  it('合法输出通过，建议只认四种 kind', () => {
    const ok = parseInsightReport({
      themes: [{ title: '低价用 AI', count: 6, examples: ['怎么便宜用 GPT'] }],
      gaps: ['macbook 闲鱼'],
      suggestions: [
        { kind: 'write', text: '写一篇低价渠道对比', evidence: '问了 6 次' },
        { kind: 'business', text: '有人愿付费代配', evidence: '卡口提问' },
        { kind: 'hack', text: '非法 kind 被丢弃', evidence: '' },
      ],
      summary: '访客最关心低价用 AI。',
    });
    expect(ok?.themes[0]?.count).toBe(6);
    expect(ok?.suggestions).toHaveLength(2);
    expect(ok?.suggestions[0]?.kind).toBe('write');
  });

  it('缺 summary / 无主题 / 非对象 → 拒收', () => {
    expect(parseInsightReport({ themes: [] , gaps: [], suggestions: [], summary: '' })).toBeNull();
    expect(parseInsightReport('not json')).toBeNull();
    expect(parseInsightReport(null)).toBeNull();
  });
});
