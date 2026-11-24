import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface AtomicWriteOptions {
  mode?: number;
  /** 是否在 rename 前调用 fsync（默认 true，正本/版本索引安全落盘；大批量恢复可传 false） */
  sync?: boolean;
  /** 落盘前确保父目录存在（默认 false） */
  mkdir?: boolean;
}

/**
 * 原子写文件：在同一目录下写入唯一 .tmp（`wx`），按需 fsync 后 rename 替换目标；
 * 任一步骤失败确保关闭文件句柄并清理临时文件。
 */
export async function atomicWriteFile(
  targetPath: string,
  data: string | Buffer,
  options?: AtomicWriteOptions,
): Promise<void> {
  if (options?.mkdir) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
  }
  const temporary = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(temporary, 'wx', options?.mode ?? 0o644);
    await handle.writeFile(data, typeof data === 'string' ? 'utf8' : undefined);
    if (options?.sync ?? true) {
      await handle.sync();
    }
    await handle.close();
    handle = undefined;
    await fs.rename(temporary, targetPath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * 按 key 串行化的进程内 Promise 队列锁：
 * 同 key 操作严格 FIFO 排队（前置任务抛错也不阻断后续），异 key 完全并发，队尾自动删除引用防泄漏。
 */
export function createKeyedLock(): <T>(key: string, operation: () => Promise<T>) => Promise<T> {
  const queues = new Map<string, Promise<void>>();
  return function withKeyedLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = queues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    queues.set(key, current);
    return previous
      .catch(() => undefined)
      .then(operation)
      .finally(() => {
        release();
        if (queues.get(key) === current) queues.delete(key);
      });
  };
}
