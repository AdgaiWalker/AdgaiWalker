import fs from 'node:fs';
import path from 'node:path';

/**
 * 寻找 API 的真实 .env 文件路径。
 *
 * 优先级：
 * 1. 显式指定的 customRoot / apiRoot；
 * 2. 当前工作目录（process.cwd() / .env）；
 * 3. 源码或构建产物相对路径（dev: apps/api/.env，prod: apps/api/dist/../../.env）。
 */
export function findApiEnvPath(customRoot?: string): string {
  if (customRoot) {
    const explicit = path.join(customRoot, '.env');
    if (fs.existsSync(explicit)) return explicit;
  }

  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }

  return customRoot ? path.join(customRoot, '.env') : candidates[0];
}
