import { describe, expect, it } from 'vitest';
import {
  buildSocialCopyText,
  buildXShareIntentUrl,
  buildXShareText,
  extractSummaryFromRaw,
  getPublicPostUrl,
} from './social-share';

describe('social-share 单一真相源工具', () => {
  it('正确拼接公开文章网址，并处理特殊字符', () => {
    expect(getPublicPostUrl('hello-world')).toBe('https://www.iwalk.pro/posts/hello-world');
    expect(getPublicPostUrl('入门 教程')).toBe('https://www.iwalk.pro/posts/%E5%85%A5%E9%97%A8%20%E6%95%99%E7%A8%8B');
    expect(getPublicPostUrl('vibe0s', 'https://custom.domain/')).toBe('https://custom.domain/posts/vibe0s');
  });

  it('生成适合 X (Twitter) 的推文结构（标题、清洗后摘要与标签）', () => {
    const text = buildXShareText({
      title: '从零搭建 AI 运营样板',
      slug: 'ai-ops-sample',
      summary: '面向真实业务场景：**消除孤岛**，沉淀自动化规则。',
      tags: ['AI', 'IndieHacker'],
    });

    expect(text).toContain('【从零搭建 AI 运营样板】');
    // Markdown ** 符号被平滑剥离
    expect(text).toContain('消除孤岛');
    expect(text).not.toContain('**');
    expect(text).toContain('#AI #IndieHacker');
  });

  it('过长摘要自动安全截断，防止推文超长', () => {
    const longSummary = '这是一段非常非常长的文字摘要'.repeat(20);
    const text = buildXShareText({
      title: '短标题',
      slug: 'test-slug',
      summary: longSummary,
    });
    expect(text.length).toBeLessThan(160);
    expect(text).toContain('…');
    expect(text).toContain('#Walker #AI');
  });

  it('构建标准合法的 X Web Intent URL', () => {
    const intentUrl = buildXShareIntentUrl({
      title: 'vibe0s 体验指南',
      slug: 'vibe0s',
      summary: '让 AI 帮你选 Skill、排流程、留方法',
    });

    expect(intentUrl.startsWith('https://x.com/intent/tweet?')).toBe(true);
    const parsed = new URL(intentUrl);
    expect(parsed.searchParams.get('url')).toBe('https://www.iwalk.pro/posts/vibe0s');
    expect(parsed.searchParams.get('text')).toContain('vibe0s 体验指南');
    expect(parsed.searchParams.get('text')).toContain('#Walker');
  });

  it('生成全渠道一键复制文案，格式完整清晰', () => {
    const copyText = buildSocialCopyText({
      title: '测试文章',
      slug: 'test-post',
      summary: '测试摘要内容',
      tags: ['NextGen'],
    });

    expect(copyText).toContain('【测试文章】');
    expect(copyText).toContain('测试摘要内容');
    expect(copyText).toContain('🔗 阅读全文：https://www.iwalk.pro/posts/test-post');
    expect(copyText).toContain('#NextGen');
  });

  it('从 raw Markdown 中可靠提取 summary', () => {
    const rawWithFm = `---
title: 测试标题
summary: 这是 frontmatter 中的摘要
date: 2026-10-31
---

# 正文
正文内容第一行。
`;
    expect(extractSummaryFromRaw(rawWithFm)).toBe('这是 frontmatter 中的摘要');

    const rawWithDescription = `---
title: 测试标题
description: "这是 description 中的摘要"
---

正文
`;
    expect(extractSummaryFromRaw(rawWithDescription)).toBe('这是 description 中的摘要');

    const rawNoFm = `# 标题

这是正文首个非标题段落。

第二段。
`;
    expect(extractSummaryFromRaw(rawNoFm)).toBe('这是正文首个非标题段落。');

    expect(extractSummaryFromRaw('')).toBe('');
    expect(extractSummaryFromRaw(null)).toBe('');
  });
});
