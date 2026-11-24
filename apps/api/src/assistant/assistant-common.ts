import { sha256Hex } from '../common/crypto';

/** 全站每日 AI 请求预算默认上限（env ASSISTANT_DAILY_LIMIT 可调） */
export const ASSISTANT_DAILY_LIMIT_DEFAULT = 200;

export const REQUEST_KEY_RE = /^[a-zA-Z0-9_-]{8,128}$/;
export const SCOPE_SLUG_RE = /^[a-zA-Z0-9_/-]{1,200}$/;
export const MESSAGE_ID_RE = /^message-[a-f0-9]{24}$/;

/** 从环境变量解析每日 AI 请求预算上限，无效或非正数时回退默认值。 */
export function resolveAssistantDailyLimit(): number {
  const configured = Number(process.env.ASSISTANT_DAILY_LIMIT);
  return Number.isFinite(configured) && configured > 0 ? configured : ASSISTANT_DAILY_LIMIT_DEFAULT;
}

/** 站点时区（UTC+8）的当日日期串（YYYY-MM-DD）。 */
export function todayCN(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 根据匿名哈希、键和实体类别生成确定性短 ID。 */
export function stableAssistantId(anonHash: string, key: string, kind: string): string {
  return `${kind}-${sha256Hex(`${anonHash}\n${key}\n${kind}`).slice(0, 24)}`;
}

/**
 * 在给定时间预算内等待异步任务完成；超时返回 fallback。
 * `swallowErrors` 为 true 时同步吞掉任务异常并返回 fallback。
 */
export async function raceWithBudget<T>(
  work: Promise<T>,
  budgetMs: number,
  fallback: T,
  swallowErrors: boolean,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), budgetMs);
    timer.unref?.();
  });
  try {
    const guarded = swallowErrors ? work.catch(() => fallback) : work;
    return await Promise.race([guarded, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
