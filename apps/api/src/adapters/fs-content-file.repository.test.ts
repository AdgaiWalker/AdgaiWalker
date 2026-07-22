import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsContentFileRepository } from './fs-content-file.repository';

describe('FsContentFileRepository', () => {
  let dir: string;
  let prev: string | undefined;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-content-'));
    prev = process.env.CONTENT_LOG_DIR;
    process.env.CONTENT_LOG_DIR = dir;
    await fs.writeFile(
      path.join(dir, 'hello-world.md'),
      '---\ntitle: 你好\ntype: knowledge\n---\n\n正文\n',
      'utf8',
    );
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.CONTENT_LOG_DIR;
    else process.env.CONTENT_LOG_DIR = prev;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('list/get/save 读写真实文件', async () => {
    const repo = new FsContentFileRepository();
    const list = await repo.list();
    expect(list.some((i) => i.slug === 'hello-world')).toBe(true);
    const doc = await repo.get('hello-world');
    expect(doc?.title).toBe('你好');
    const saved = await repo.save(
      'hello-world',
      '---\ntitle: 新标题\ntype: knowledge\n---\n\n更新\n',
    );
    expect(saved.title).toBe('新标题');
    const raw = await fs.readFile(path.join(dir, 'hello-world.md'), 'utf8');
    expect(raw).toContain('新标题');
  });
});
