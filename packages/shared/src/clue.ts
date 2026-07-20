/** 线索来源 */
export type ClueSource =
  | 'manual-self'
  | 'tools-visitor'
  | 'wechat'
  | 'live'
  | 'other-external';

/** 池状态 */
export type CluePoolStatus = 'candidate' | 'in-pool' | 'discarded';

export const CLUE_BODY_MIN_LENGTH = 4;

const CLUE_SOURCES: readonly ClueSource[] = [
  'manual-self',
  'tools-visitor',
  'wechat',
  'live',
  'other-external',
] as const;

export function isClueSource(value: string): value is ClueSource {
  return (CLUE_SOURCES as readonly string[]).includes(value);
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
