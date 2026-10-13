import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
      (await repo.get('hello-world'))!.hash,
    );
    expect(saved.title).toBe('新标题');
    const raw = await fs.readFile(path.join(dir, 'hello-world.md'), 'utf8');
    expect(raw).toContain('新标题');
  });

  it('两个仓储实例对同一旧版本并发保存时恰好一个成功', async () => {
    const original = await fs.readFile(path.join(dir, 'hello-world.md'), 'utf8');
    const expectedHash = createHash('sha256').update(original).digest('hex');
    const first = new FsContentFileRepository();
    const second = new FsContentFileRepository();

    const results = await Promise.allSettled([
      first.save('hello-world', '---\ntitle: 第一份\ntype: knowledge\n---\n\n第一份\n', expectedHash),
      second.save('hello-world', '---\ntitle: 第二份\ntype: knowledge\n---\n\n第二份\n', expectedHash),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const saved = await fs.readFile(path.join(dir, 'hello-world.md'), 'utf8');
    expect(['第一份', '第二份'].some((title) => saved.includes(`title: ${title}`))).toBe(true);
  });

  it('expectedHash 与当前正文不匹配时拒绝覆盖', async () => {
    const original = await fs.readFile(path.join(dir, 'hello-world.md'), 'utf8');
    const repo = new FsContentFileRepository();

    await expect(repo.save(
      'hello-world',
      '---\ntitle: 过期修改\ntype: knowledge\n---\n\n不得覆盖\n',
      'f'.repeat(64),
    )).rejects.toMatchObject({ response: { code: 'content-version-conflict' } });
    expect(await fs.readFile(path.join(dir, 'hello-world.md'), 'utf8')).toBe(original);
  });

  it('expectedHash 为 null 时只允许创建不存在的 slug', async () => {
    const repo = new FsContentFileRepository();
    const raw = '---\ntitle: 新文章\ntype: knowledge\n---\n\n新正文\n';
    const created = await repo.save('new-article', raw, null);

    expect(created.hash).toBe(createHash('sha256').update(raw).digest('hex'));
    await expect(repo.save('new-article', `${raw}第二次`, null))
      .rejects.toMatchObject({ response: { code: 'content-version-conflict' } });
    expect(await fs.readFile(path.join(dir, 'new-article.md'), 'utf8')).toBe(raw);
  });

  it('拒绝不支持的 slug 且不触碰内容目录外文件', async () => {
    const repo = new FsContentFileRepository();
    await expect(repo.save('../outside', '---\ntitle: x\n---', null))
      .rejects.toMatchObject({ response: { code: 'invalid-slug' } });
    await expect(repo.save('Hello-World', '---\ntitle: x\n---', null))
      .rejects.toMatchObject({ response: { code: 'invalid-slug' } });
    expect(await fs.readdir(dir)).toEqual(['hello-world.md']);
  });

  it('原子替换失败时原文仍完整可读且临时文件被清理', async () => {
    const repo = new FsContentFileRepository();
    const original = await repo.get('hello-world');
    const rename = vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('replace-failed'));

    try {
      await expect(repo.save(
        'hello-world',
        '---\ntitle: 未替换\ntype: knowledge\n---\n\n新正文\n',
        original!.hash,
      )).rejects.toThrow('replace-failed');
    } finally {
      rename.mockRestore();
    }

    expect(await fs.readFile(path.join(dir, 'hello-world.md'), 'utf8')).toBe(original?.raw);
    expect((await fs.readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('临时文件写入失败时不会暴露部分正文', async () => {
    const repo = new FsContentFileRepository();
    const original = await repo.get('hello-world');
    const open = vi.spyOn(fs, 'open').mockImplementation(async (filePath) => {
      await fs.writeFile(filePath, '部分正文', { flag: 'wx' });
      return {
        writeFile: async () => { throw new Error('write-failed'); },
        sync: async () => undefined,
        close: async () => undefined,
      } as unknown as Awaited<ReturnType<typeof fs.open>>;
    });

    try {
      await expect(repo.save(
        'hello-world',
        '---\ntitle: 未完整写入\ntype: knowledge\n---\n\n正文\n',
        original!.hash,
      )).rejects.toThrow('write-failed');
    } finally {
      open.mockRestore();
    }

    expect(await fs.readFile(path.join(dir, 'hello-world.md'), 'utf8')).toBe(original?.raw);
    expect((await fs.readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
