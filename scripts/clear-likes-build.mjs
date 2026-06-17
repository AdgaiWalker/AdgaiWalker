// build 期一次性清零：删 Redis 里所有 like:* 与 cooldown:*（点赞历史残留）。
// 精确 pattern 删除，绝不触碰 auth:* / match:* / ai-gateway:* 等其他 key。
// 本次构建执行，清完后会从 build 流程摘除。
// 关键：无凭据 / 出错均 exit(0)，绝不阻断 build。
import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

if (!url || !token) {
  console.log('[clear-likes] no redis creds in build env, skip');
  process.exit(0);
}

async function clearPattern(redis, pattern) {
  let cursor = '0';
  let deleted = 0;
  do {
    const res = await redis.scan(cursor, { match: pattern, count: 500 });
    let next, keys;
    if (Array.isArray(res)) {
      [next, keys] = res;
    } else {
      next = res.cursor;
      keys = res.keys ?? [];
    }
    if (keys.length > 0) {
      await redis.del(...keys);
      deleted += keys.length;
    }
    cursor = String(next);
  } while (cursor !== '0');
  return deleted;
}

try {
  const redis = new Redis({ url, token });
  const d1 = await clearPattern(redis, 'like:*');
  const d2 = await clearPattern(redis, 'cooldown:*');
  console.log(`[clear-likes] deleted like:*=${d1} cooldown:*=${d2} total=${d1 + d2}`);
} catch (e) {
  console.log(`[clear-likes] error (non-fatal, build continues): ${e?.message ?? e}`);
} finally {
  process.exit(0);
}
