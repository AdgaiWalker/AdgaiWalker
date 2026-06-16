import { describe, it, expect } from 'vitest';
import { isPublicParsedContent, isAiReadableParsed, type ParsedContent } from './content-query';

function makeItem(fm: Record<string, unknown>): ParsedContent {
  return { slug: 'test', filePath: '/test.md', frontmatter: fm, body: '' };
}

describe('content-query 内容边界 (U14 MCP 私有验收)', () => {
  describe('isPublicParsedContent — 公开边界（draft/private 不通过 MCP 暴露）', () => {
    it('visibility: public 通过', () => {
      expect(isPublicParsedContent(makeItem({ visibility: 'public' }))).toBe(true);
    });
    it('visibility: draft 拒绝', () => {
      expect(isPublicParsedContent(makeItem({ visibility: 'draft' }))).toBe(false);
    });
    it('visibility: private 拒绝', () => {
      expect(isPublicParsedContent(makeItem({ visibility: 'private' }))).toBe(false);
    });
    it('published: false 拒绝（无 visibility 时降级判断）', () => {
      expect(isPublicParsedContent(makeItem({ published: false }))).toBe(false);
    });
    it('published: true 通过（无 visibility 时降级判断）', () => {
      expect(isPublicParsedContent(makeItem({ published: true }))).toBe(true);
    });
  });

  describe('isAiReadableParsed — AI-0 边界（AI-0 不通过 MCP 暴露）', () => {
    it('aiUsePolicy.level = AI-0 拒绝', () => {
      expect(isAiReadableParsed(makeItem({ aiUsePolicy: { level: 'AI-0' } }))).toBe(false);
    });
    it('aiUsePolicy.level = AI-2 通过', () => {
      expect(isAiReadableParsed(makeItem({ aiUsePolicy: { level: 'AI-2' } }))).toBe(true);
    });
    it('aiUsePolicy.level = AI-4 通过', () => {
      expect(isAiReadableParsed(makeItem({ aiUsePolicy: { level: 'AI-4' } }))).toBe(true);
    });
    it('无 aiUsePolicy 通过（默认可读）', () => {
      expect(isAiReadableParsed(makeItem({}))).toBe(true);
    });
    it('aiUsePolicy 无 level 通过', () => {
      expect(isAiReadableParsed(makeItem({ aiUsePolicy: { readable: true } }))).toBe(true);
    });
  });
});
