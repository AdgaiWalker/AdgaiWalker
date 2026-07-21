export interface GuestQuotaPort {
  /** 是否已用尽完整配额（1 次） */
  isExhausted(anonId: string): Promise<boolean>;
  /** 消耗一次；若已用尽返回 false */
  consume(anonId: string): Promise<boolean>;
}

export const GUEST_QUOTA = Symbol('GUEST_QUOTA');
