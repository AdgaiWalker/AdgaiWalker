/**
 * FeatureEvent.failCode 字面量（snake，与历史指标键一致，勿随意改值）
 * HTTP ErrorCode 仍用 kebab（errors.ts）；对照见 HTTP_TO_FEATURE_FAIL
 */
export const FEATURE_FAIL_CODES = {
  serverError: 'server_error',
  rateLimited: 'rate_limited',
  quotaExceeded: 'quota_exceeded',
  validationError: 'validation_error',
} as const;

export type FeatureFailCode =
  (typeof FEATURE_FAIL_CODES)[keyof typeof FEATURE_FAIL_CODES];

/** HTTP ErrorCode → 埋点 failCode（展示/文档用；不自动改写历史） */
export const HTTP_TO_FEATURE_FAIL: Record<string, FeatureFailCode> = {
  'rate-limited': FEATURE_FAIL_CODES.rateLimited,
  'guest-quota-exceeded': FEATURE_FAIL_CODES.quotaExceeded,
  'validation-error': FEATURE_FAIL_CODES.validationError,
  'storage-unavailable': FEATURE_FAIL_CODES.serverError,
  'missing-clue': FEATURE_FAIL_CODES.validationError,
};
