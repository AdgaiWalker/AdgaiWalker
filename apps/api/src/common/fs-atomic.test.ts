import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { atomicWriteFile, createKeyedLock } from './fs-atomic';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('fs-atomic（原子写入与按 key 串行队列锁）', () => {
  it('createKeyedLock 严格串行化同 key 任务，异常不破坏后续队列，且支持异 key 并发', async () => {
    const withLock = createKeyedLock();
    const trace: string[] = [];

    const t1 = withLock('slug-a', async () => {
      trace.push('a1:start');
      await new Promise((r) => setTimeout(r, 20));
      trace.push('a1:end');
      return 1;
    });
    const tFail = withLock('slug-a', async () => {
      trace.push('a2:fail');
      throw new Error('boom');
    }).catch((err: Error) => err.message);
    const t3 = withLock('slug-a', async () => {
      trace.push('a3:ok');
      return 3;
    });
    const tOther = withLock('slug-b', async () => {
      trace.push('b1:run');
      return 'b';
    });

    const [r1, r2, r3, rb] = await Promise.all([t1, tFail, t3, tOther]);
    expect([r1, r2, r3, rb]).toEqual([1, 'boom', 3, 'b']);
    expect(trace.indexOf('a1:end')).toBeLessThan(trace.indexOf('a2:fail'));
    expect(trace.indexOf('a2:fail')).toBeLessThan(trace.indexOf('a3:ok'));
  });

  it('atomicWriteFile 写入完整内容并支持 mkdir，且不在目录中留下临时文件残渣', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-fs-atomic-'));
    tmpDirs.push(dir);
    const target = path.join(dir, 'nested', 'post.md');

    await atomicWriteFile(target, '# v1\n', { mkdir: true });
    expect(await fs.readFile(target, 'utf8')).toBe('# v1\n');

    await atomicWriteFile(target, Buffer.from('# v2\n', 'utf8'), { sync: false });
    expect(await fs.readFile(target, 'utf8')).toBe('# v2\n');

    const entries = await fs.readdir(path.dirname(target));
    expect(entries).toEqual(['post.md']);
  });
});
