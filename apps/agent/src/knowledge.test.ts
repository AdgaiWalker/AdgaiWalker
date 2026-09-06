import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { KnowledgeService } from './plugins/knowledge.js';

/** 临时 content.json：两条可读可引用、一条不可读（readable=false）、一条可读不可引用 */
function fixture(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'walker-agent-'));
  const file = path.join(dir, 'content.json');
  writeFileSync(
    file,
    JSON.stringify({
      items: [
        {
          slug: 'evaluate-ai-tools',
          title: '评估 AI 工具的三步法',
          summary: '最小场景、连续三次、记录卡点',
          tags: ['AI', '工具'],
          domain: 'ai',
          form: 'tutorial',
          intent: 'teach',
          body: '正文：先选一个最小场景…',
          aiUsePolicy: { readable: true, citable: true },
        },
        {
          slug: 'weekly-report',
          title: '周报自动化',
          summary: '用 AI 写周报的流程',
          tags: ['写作'],
          domain: 'productivity',
          body: '正文…',
          aiUsePolicy: { readable: true, citable: true },
        },
        {
          slug: 'private-diary',
          title: '私人日记',
          summary: '不可读内容',
          tags: [],
          body: '脆弱内容',
          aiUsePolicy: { readable: false, citable: false },
        },
        {
          slug: 'background-only',
          title: '背景阅读',
          summary: '可读但不可引用',
          tags: [],
          body: '仅背景',
          aiUsePolicy: { readable: true, citable: false },
        },
      ],
    }),
    'utf8',
  );
  return file;
}

function load(file: string): KnowledgeService {
  const ctx = new Context();
  return new KnowledgeService(ctx, { contentPath: file });
}

describe('knowledge 插件（aiUsePolicy fail-closed）', () => {
  it('readable=false 永不入索引；空索引拒绝启动', () => {
    const file = fixture();
    const svc = load(file);
    expect(svc.get('private-diary')).toBeNull();
    rmSync(path.dirname(file), { recursive: true, force: true });

    const dir = mkdtempSync(path.join(tmpdir(), 'walker-agent-empty-'));
    const empty = path.join(dir, 'content.json');
    writeFileSync(empty, JSON.stringify({ items: [{ slug: 'x', title: 'x', aiUsePolicy: { readable: false } }] }), 'utf8');
    expect(() => load(empty)).toThrow('拒绝空索引启动');
    rmSync(dir, { recursive: true, force: true });
  });

  it('search 只返回 citable，命中理由随行', () => {
    const svc = load(fixture());
    const hits = svc.search('AI 工具');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.slug).toBe('evaluate-ai-tools');
    expect(hits[0]!.why.length).toBeGreaterThan(0);
    expect(svc.search('背景阅读')).toEqual([]); // 可读不可引用 → 不进检索
  });

  it('get 按 readable 放行（citable=false 仍可精读），方法论按 domain 聚合', () => {
    const svc = load(fixture());
    expect(svc.get('background-only')?.slug).toBe('background-only');
    const groups = svc.methodology();
    expect(groups[0]!.domain).toBe('ai');
    expect(svc.citableList().map((e) => e.slug)).toEqual(['evaluate-ai-tools', 'weekly-report']);
  });
});
