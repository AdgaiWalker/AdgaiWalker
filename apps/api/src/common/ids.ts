import { randomBytes } from 'node:crypto';

/** ULID 风格时间有序 ID（无外部依赖） */
export function newId(): string {
  const t = Date.now().toString(36);
  const r = randomBytes(10).toString('hex');
  return `${t}${r}`;
}
