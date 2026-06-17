import { describe, expect, it } from 'vitest';
import { parseDoc, serializeDoc, FORM_ENUMS } from '@/lib/frontmatter-editor';

describe('parseDoc', () => {
  it('解析 frontmatter + body', () => {
    const raw = '---\ntitle: 测试\ntype: knowledge\ntags:\n  - ai\n---\n\n正文段落\n';
    const doc = parseDoc(raw);
    expect(doc.frontmatter.title).toBe('测试');
    expect(doc.frontmatter.type).toBe('knowledge');
    expect(doc.frontmatter.tags).toEqual(['ai']);
    expect(doc.body.trim()).toBe('正文段落');
  });

  it('无 frontmatter 时整体作为 body', () => {
    const doc = parseDoc('纯正文，没有 fm');
    expect(doc.frontmatter).toEqual({});
    expect(doc.body).toBe('纯正文，没有 fm');
  });

  it('frontmatter 语法损坏时不抛错，返回空 fm', () => {
    const doc = parseDoc('---\n: : bad yaml\n---\n正文');
    expect(doc.body.trim()).toBe('正文');
  });
});

describe('serializeDoc', () => {
  it('序列化为合法 frontmatter + body', () => {
    const raw = serializeDoc({
      frontmatter: { title: '标题', type: 'knowledge', tags: ['a', 'b'] },
      body: '正文',
    });
    expect(raw.startsWith('---\n')).toBe(true);
    expect(raw).toContain('title: 标题');
    expect(raw).toContain('- a');
    expect(raw.trimEnd().endsWith('正文')).toBe(true);
  });
});

describe('往返一致性', () => {
  it('parse(serialize(parse(x))) 稳定', () => {
    const original = '---\ntitle: 往返\ntype: idea\nvisibility: draft\n---\n\n## 标题\n\n内容段落\n';
    const doc = parseDoc(original);
    const roundtrip = parseDoc(serializeDoc(doc));
    expect(roundtrip.frontmatter).toEqual(doc.frontmatter);
    expect(roundtrip.body.trim()).toBe(doc.body.trim());
  });
});

describe('FORM_ENUMS', () => {
  it('visibility 含 public/draft/private', () => {
    expect(FORM_ENUMS.visibility).toEqual(['public', 'draft', 'private']);
  });
  it('aiLevel 含 AI-0 ~ AI-4', () => {
    expect(FORM_ENUMS.aiLevel).toEqual(['AI-0', 'AI-1', 'AI-2', 'AI-3', 'AI-4']);
  });
});
