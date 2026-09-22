/**
 * content/log 目录解析（唯一实现）：
 * CONTENT_LOG_DIR 显式覆盖优先，否则按运行时 cwd 依次探测。
 * 管理端内容仓储与内容台账仓储共用，避免两处各写一份探测顺序产生漂移。
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export async function resolveContentLogDir(): Promise<string> {
  const fromEnv = process.env.CONTENT_LOG_DIR?.trim();
  if (fromEnv) {
    const p = path.resolve(fromEnv);
    await fs.access(p);
    return p;
  }
  const candidates = [
    path.resolve(process.cwd(), 'content/log'),
    path.resolve(process.cwd(), '../../content/log'),
    path.resolve(process.cwd(), '../content/log'),
  ];
  for (const c of candidates) {
    try {
      await fs.access(c);
      return c;
    } catch {
      /* next */
    }
  }
  throw new Error('content-log-unavailable');
}
