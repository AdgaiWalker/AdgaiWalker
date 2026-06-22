/**
 * 内存降级存储工厂 — 当 Redis 不可用时（开发环境 / 运行时异常）的兜底。
 *
 * 每个域 Store 自带一份内存 Map，通过此工厂创建以保持一致的模式。
 * 后续可在此统一加入 size 上限、TTL、日志等共享行为。
 */
export function createMemoryStore<V>(): Map<string, V> {
  return new Map<string, V>();
}
