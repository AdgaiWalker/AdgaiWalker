/** API / 领域机器可读错误码（与 HTTP 映射由 api 层负责） */
export type ErrorCode =
  | 'guest-quota-exceeded'
  | 'rate-limited'
  | 'storage-unavailable'
  | 'missing-clue'
  | 'validation-error';

export function isErrorCode(value: string): value is ErrorCode {
  return (
    value === 'guest-quota-exceeded' ||
    value === 'rate-limited' ||
    value === 'storage-unavailable' ||
    value === 'missing-clue' ||
    value === 'validation-error'
  );
}
