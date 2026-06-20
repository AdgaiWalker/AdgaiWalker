/**
 * 存储环境策略（P0-B03）
 *
 * 三种模式：
 * - redis                生产/预览持久化（真实事实，刷新/重启不丢失）
 * - memory-development   开发期显式内存降级（进程重启即失，必须明确标记）
 * - unavailable          生产缺 Redis 时写 API 必须失败，不静默退回内存
 *
 * 判定规则：
 * - 开发环境（NODE_ENV !== 'production'）且无 Redis → memory-development
 * - 生产/预览有 Redis → redis
 * - 生产/预览无 Redis → unavailable
 *
 * 护栏（hai-razor）：生产缺少持久化依赖时不得静默使用内存制造假持久。
 */

export type StorageMode = 'redis' | 'memory-development' | 'unavailable';

export interface StorageModeContext {
  /** 是否拿到真实 Redis 连接 */
  hasRedis: boolean;
  /** 当前运行环境；未显式提供时读 import.meta.env.MODE / process.env.NODE_ENV */
  environment?: string;
}

export function resolveStorageMode(input: StorageModeContext): StorageMode {
  if (input.hasRedis) return 'redis';
  const env = input.environment
    ?? (typeof import.meta !== 'undefined' && (import.meta as { env?: { MODE?: string } }).env?.MODE)
    ?? (typeof process !== 'undefined' ? process.env?.NODE_ENV : undefined)
    ?? 'production';
  // 开发与测试环境允许显式内存降级；生产/预览缺 Redis 必须 unavailable
  return env === 'development' || env === 'test' ? 'memory-development' : 'unavailable';
}

/** 是否允许写入。redis 与 memory-development 都允许；unavailable 拒绝。 */
export function isWritable(mode: StorageMode): boolean {
  return mode !== 'unavailable';
}

/** 是否是持久化存储（刷新/重启不丢失）。仅 redis 为 true。 */
export function isPersistent(mode: StorageMode): boolean {
  return mode === 'redis';
}
