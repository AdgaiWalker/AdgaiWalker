/**
 * like.store — 文章点赞计数仓储（端口 + 实现）
 *
 * 设计要点（对齐项目 Redis→内存 降级链，见 conversation/store.ts）：
 * - 0 起步真实计数：没有写死的假基数，没被点过的页面就是 0。
 * - createLikeStore 工厂：有 UPSTASH/KV 环境变量用 Upstash；否则用内存（dev 无 Redis 也能真点真涨）。
 * - Upstash 版用 redis.incr 原子自增，修掉旧 get-then-set 的并发丢赞；冷却用 set+ex 原子写入。
 * - Upstash 运行时异常（网络等）降级到内存单例，store 方法永不向上抛。
 *
 * 路径合法性校验在 API 薄层（api/like.ts）做，store 假定 path 已校验。
 */
import { Redis } from '@upstash/redis';

/** 单页点赞上限 */
const MAX_COUNT = 999_999;
/** 每路径每 IP 冷却秒数 */
const COOLDOWN_SECONDS = 60;

const countKey = (path: string) => `like:${path}`;
const cooldownKey = (path: string, ip: string) => `cooldown:${path}:${ip}`;

export interface LikeResult {
  count: number;
  /** true = 该 IP 在冷却期内，本次未计入 */
  cooled: boolean;
}

export interface LikeStore {
  getCount(path: string): Promise<number>;
  increment(path: string, ip: string): Promise<LikeResult>;
}

// ---------------------------------------------------------------------------
// 内存降级实现（dev 无 Redis / 生产 Redis 运行时异常时兜底）
// ---------------------------------------------------------------------------

class InMemoryLikeStore implements LikeStore {
  private counts = new Map<string, number>();
  private cooldowns = new Map<string, number>(); // key → 过期时间戳(ms)

  async getCount(path: string): Promise<number> {
    return this.counts.get(countKey(path)) ?? 0;
  }

  async increment(path: string, ip: string): Promise<LikeResult> {
    const ck = cooldownKey(path, ip);
    const now = Date.now();
    const exp = this.cooldowns.get(ck);
    if (exp !== undefined && exp > now) {
      return { count: this.counts.get(countKey(path)) ?? 0, cooled: true };
    }
    const current = this.counts.get(countKey(path)) ?? 0;
    const next = Math.min(current + 1, MAX_COUNT);
    this.counts.set(countKey(path), next);
    this.cooldowns.set(ck, now + COOLDOWN_SECONDS * 1000);
    return { count: next, cooled: false };
  }
}

// 内存单例：Upstash 运行时异常时复用同一份内存计数
const memoryStore = new InMemoryLikeStore();

// ---------------------------------------------------------------------------
// Upstash Redis 实现
// ---------------------------------------------------------------------------

class UpstashLikeStore implements LikeStore {
  constructor(private redis: Redis) {}

  async getCount(path: string): Promise<number> {
    try {
      return (await this.redis.get<number>(countKey(path))) ?? 0;
    } catch {
      return memoryStore.getCount(path);
    }
  }

  async increment(path: string, ip: string): Promise<LikeResult> {
    try {
      const ck = cooldownKey(path, ip);

      // 冷却期内：不计入，返回当前计数
      if (await this.redis.get(ck)) {
        return { count: (await this.redis.get<number>(countKey(path))) ?? 0, cooled: true };
      }

      // 原子自增（修掉旧 get-then-set 的并发丢赞）
      const next = await this.redis.incr(countKey(path));
      const clamped = Math.min(next, MAX_COUNT);
      if (clamped !== next) await this.redis.set(countKey(path), clamped);

      // set + ex 原子写冷却标记
      await this.redis.set(ck, 1, { ex: COOLDOWN_SECONDS });

      return { count: clamped, cooled: false };
    } catch {
      return memoryStore.increment(path, ip);
    }
  }
}

// ---------------------------------------------------------------------------
// 工厂：有 Redis 配置用 Upstash，否则内存
// ---------------------------------------------------------------------------

let cached: LikeStore | undefined;

export function createLikeStore(): LikeStore {
  if (cached) return cached;
  const env = import.meta.env as Record<string, string | undefined>;
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (url && token) {
    try {
      cached = new UpstashLikeStore(new Redis({ url, token }));
      return cached;
    } catch {
      // 构造失败 → 落到内存
    }
  }
  cached = memoryStore;
  return cached;
}
