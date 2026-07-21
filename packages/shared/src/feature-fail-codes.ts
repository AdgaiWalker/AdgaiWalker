/**
 * FeatureEvent.failCode — 与 HTTP ErrorCode 统一为 kebab
 * 新写入只用 FEATURE_FAIL_CODES；读侧用 normalizeFeatureFailCode 合并历史 snake
 */
import type { ErrorCode } from './errors.js';

/** 新写入唯一字面量（= HTTP ErrorCode 或 storage 语义） */
export const FEATURE_FAIL_CODES = {
  /** 不可写 / 存储不可用 */
  storageUnavailable: 'storage-unavailable',
  rateLimited: 'rate-limited',
  guestQuotaExceeded: 'guest-quota-exceeded',
  validationError: 'validation-error',
  missingClue: 'missing-clue',
} as const satisfies Record<string, ErrorCode>;

export type FeatureFailCode =
  (typeof FEATURE_FAIL_CODES)[keyof typeof FEATURE_FAIL_CODES];

/**
 * 历史 snake 键 → 现行 kebab（仅聚合/展示；不回写库）
 * server_error 归入 storage-unavailable（旧 intake 无库失败）
 */
export const LEGACY_FAIL_CODE_ALIASES: Record<string, FeatureFailCode> = {
  server_error: FEATURE_FAIL_CODES.storageUnavailable,
  rate_limited: FEATURE_FAIL_CODES.rateLimited,
  quota_exceeded: FEATURE_FAIL_CODES.guestQuotaExceeded,
  validation_error: FEATURE_FAIL_CODES.validationError,
};

/** 将任意历史/现行 failCode 规范为现行词表键 */
export function normalizeFeatureFailCode(code: string): string {
  return LEGACY_FAIL_CODE_ALIASES[code] ?? code;
}

/**
 * 合并 failCodes 计数：历史 snake 并入 kebab
 */
export function mergeFailCodeCounts(
  raw: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, n] of Object.entries(raw)) {
    const key = normalizeFeatureFailCode(code);
    out[key] = (out[key] ?? 0) + n;
  }
  return out;
}

