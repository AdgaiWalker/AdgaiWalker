import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsKnowledgeGraph } from './fs-knowledge-graph';

describe('FsKnowledgeGraph', () => {
  let dir: string;
  let prevContentDir: string | undefined;
  let prevContentJson: string | undefined;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-graph-log-'));
    prevContentDir = process.env.CONTENT_LOG_DIR;
    prevContentJson = process.env.SITE_CONTENT_JSON;
    process.env.CONTENT_LOG_DIR = dir;
    delete process.env.SITE_CONTENT_JSON;

    await fs.writeFile(
      path.join(dir, 'alpha.md'),
      '---\ntitle: Alpha\ndate: 2026-11-20\ntype: knowledge\ntags: [arch]\nsummary: A\n---\n\nSee [[beta]] and ![img](diagram.png)\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(dir, 'beta.md'),
      '---\ntitle: Beta\ndate: 2026-11-21\ntype: knowledge\ntags: [arch]\nsummary: B\n---\n\nBody B\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(dir, 'secret-draft.md'),
      '---\ntitle: Secret\nvisibility: draft\npublished: false\n---\n\nHidden\n',
      'utf8',
    );
    await fs.writeFile(path.join(dir, 'diagram.png'), Buffer.from([137, 80, 78, 71]));
  });

  afterEach(async () => {
    if (prevContentDir === undefined) delete process.env.CONTENT_LOG_DIR;
    else process.env.CONTENT_LOG_DIR = prevContentDir;
    if (prevContentJson === undefined) delete process.env.SITE_CONTENT_JSON;
    else process.env.SITE_CONTENT_JSON = prevContentJson;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('直接从 CONTENT_LOG_DIR 构建图谱（无需 generated/content.json），排除草稿并保留附件', async () => {
    const graph = await new FsKnowledgeGraph().load();
    const noteSlugs = graph.nodes.filter((n) => n.kind === 'note').map((n) => n.slug).sort();
    expect(noteSlugs).toEqual(['alpha', 'beta']);
    expect(graph.nodes.some((n) => n.kind === 'attachment' && n.path.includes('diagram.png'))).toBe(true);
    expect(graph.edges.some((e) => e.source === 'note:alpha' && e.target === 'note:beta')).toBe(true);
  });
});
