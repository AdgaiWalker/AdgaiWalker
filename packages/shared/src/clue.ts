/** 线索来源 */
export type ClueSource =
  | 'manual-self'
  | 'tools-visitor'
  | 'wechat'
  | 'live'
  | 'other-external';

/** 池状态 */
export type CluePoolStatus = 'candidate' | 'in-pool' | 'discarded';

/** 线索正文发送门槛：trim 后 ≥ 1（非空即可发送，不再硬性卡 4 字） */
export const CLUE_BODY_MIN_LENGTH = 1;

/** 完整体验/消耗配额的字数阈值（少于 4 字为轻量问候或探寻，不扣减体验配额） */
export const CLUE_QUOTA_MIN_LENGTH = 4;

/** 判断是否达到扣减访客体验配额的门槛（≥4 字） */
export function consumesGuestQuota(body: string): boolean {
  return body.trim().length >= CLUE_QUOTA_MIN_LENGTH;
}

export const CLUE_SOURCES: readonly ClueSource[] = [
  'manual-self',
  'tools-visitor',
  'wechat',
  'live',
  'other-external',
] as const;

export function isClueSource(value: string): value is ClueSource {
  return (CLUE_SOURCES as readonly string[]).includes(value);
}

/** 14 天验证盒：来源分桶（访客 / 自记 / 外贴） */
export type SourceBucket = 'visitor' | 'self' | 'external';

export function sourceBucket(source: ClueSource): SourceBucket {
  if (source === 'manual-self') return 'self';
  if (source === 'tools-visitor') return 'visitor';
  return 'external';
}

/** 非 manual-self 视为外部来源 */
export function isExternalSource(source: ClueSource): boolean {
  return source !== 'manual-self';
}

/** 线索正文最短：trim 后 ≥ 4 */
export function isValidClueBody(body: string): boolean {
  return body.trim().length >= CLUE_BODY_MIN_LENGTH;
}

export function assertClueBody(body: string): void {
  if (!isValidClueBody(body)) {
    throw new Error('validation-error:clue-body-too-short');
  }
}
