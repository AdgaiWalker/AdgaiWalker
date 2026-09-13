import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { KnowledgeService } from './plugins/knowledge.js';

const dir = mkdtempSync(path.join(tmpdir(), 'walker-agent-graph-'));
const contentPath = path.join(dir, 'content.json');

writeFileSync(
  contentPath,
  JSON.stringify({
    items: [
      {
        slug: 'a',
        title: 'A',
        summary: 'a 摘要',
        tags: ['AI'],
        body: '正文引用 [[b]]、[[bg]]、[[secret]]',
        aiUsePolicy: { readable: true, citable: true },
      },
      {
        slug: 'b',
        title: 'B',
        summary: 'b 摘要',
        tags: ['AI'],
        body: '指向 [[d]]',
        aiUsePolicy: { readable: true, citable: true },
      },
      {
        slug: 'd',
        title: 'D',
        summary: 'd 摘要',
        tags: [],
        body: '',
        aiUsePolicy: { readable: true, citable: true },
      },
      {
        slug: 'bg',
        title: '背景',
        summary: '不该外泄的摘要',
        tags: [],
        body: '',
        aiUsePolicy: { readable: true, citable: false },
      },
      {
        slug: 'secret',
        title: '不可读',
        summary: '绝不该出现',
        tags: [],
        body: '',
        aiUsePolicy: { readable: false, citable: false },
      },
    ],
  }),
  'utf8',
);

const service = new KnowledgeService(new Context(), { contentPath });

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function ids(result: NonNullable<ReturnType<KnowledgeService['neighbors']>>): string[] {
  return result.nodes.map((node) => node.slug || node.title).sort();
}

describe('MCP neighbors（沿正文互引导航）', () => {
  it('depth 1 只回直接邻居，depth 2 才展开到邻居的邻居', () => {
    const one = service.neighbors('a', 1)!;
    const two = service.neighbors('a', 2)!;
    expect(one.depth).toBe(1);
    expect(ids(one)).toContain('b');
    expect(ids(one)).not.toContain('d');
    expect(ids(two)).toContain('d');
  });

  it('反向链接也算邻居（局部图无向展开）', () => {
    const fromB = service.neighbors('b', 1)!;
    expect(ids(fromB)).toContain('a');
  });

  it('citable=false 的邻居只回存在性与位置，摘要一律不出现', () => {
    const result = service.neighbors('a', 1)!;
    const bg = result.nodes.find((node) => node.slug === 'bg')!;
    expect(bg.citable).toBe(false);
    expect(bg.summary).toBeUndefined();
    expect(bg.title).toBe('背景');
  });

  it('只对 citable 邻居给出摘要', () => {
    const result = service.neighbors('a', 1)!;
    const b = result.nodes.find((node) => node.slug === 'b')!;
    expect(b.citable).toBe(true);
    expect(b.summary).toBe('b 摘要');
  });

  it('指向不可读文章的链接成为幽灵节点，不带出任何内容', () => {
    const result = service.neighbors('a', 1)!;
    const ghost = result.nodes.find((node) => node.kind === 'ghost')!;
    expect(ghost.slug).toBe('secret');
    expect(ghost.title).toBe('secret');
    expect(ghost.citable).toBe(false);
    expect(ghost.summary).toBeUndefined();
  });

  it('中心节点与边随行，未知 slug 返回 null 而不是空图', () => {
    const result = service.neighbors('a', 1)!;
    expect(result.center.slug).toBe('a');
    expect(result.edges.some((edge) => edge.source === 'note:a')).toBe(true);
    expect(service.neighbors('不存在')).toBeNull();
  });

  it('depth 被夹在 1–5', () => {
    expect(service.neighbors('a', 99)!.depth).toBe(5);
    expect(service.neighbors('a', 0)!.depth).toBe(1);
  });
});
