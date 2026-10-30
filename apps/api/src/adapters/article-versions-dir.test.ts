import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveArticleVersionsDir } from './article-versions-dir';

/**
 * 解析纪律回归：版本库落点必须跟内容目录走。
 * 曾经的事故：集成测试把 CONTENT_LOG_DIR 改到临时目录，版本库却按 cwd 回落到仓库真实
 * content/versions，测试 slug 直接写进了生产数据。
 */
describe('resolveArticleVersionsDir', () => {
  const prevVersions = process.env.ARTICLE_VERSIONS_DIR;
  const prevLog = process.env.CONTENT_LOG_DIR;
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'walker-avdir-'));
    delete process.env.ARTICLE_VERSIONS_DIR;
    delete process.env.CONTENT_LOG_DIR;
  });
  afterEach(() => {
    if (prevVersions === undefined) delete process.env.ARTICLE_VERSIONS_DIR;
    else process.env.ARTICLE_VERSIONS_DIR = prevVersions;
    if (prevLog === undefined) delete process.env.CONTENT_LOG_DIR;
    else process.env.CONTENT_LOG_DIR = prevLog;
    rmSync(root, { recursive: true, force: true });
  });

  it('ARTICLE_VERSIONS_DIR 显式覆盖优先，并被创建', async () => {
    const explicit = path.join(root, 'explicit-versions');
    process.env.ARTICLE_VERSIONS_DIR = explicit;
    expect(await resolveArticleVersionsDir()).toBe(path.resolve(explicit));
  });

  it('CONTENT_LOG_DIR 被改道时版本库跟随姊妹目录——绝不回落到仓库真实版本库', async () => {
    const logDir = path.join(root, 'content', 'log');
    process.env.CONTENT_LOG_DIR = logDir;
    const resolved = await resolveArticleVersionsDir();
    expect(resolved).toBe(path.join(path.resolve(root), 'content', 'versions'));
    expect(resolved).not.toContain(path.join('AdgaiWalker', 'content', 'versions'));
  });
});
