export interface GuestQuotaPort {
  /** 是否已用尽完整配额（1 次） */
  isExhausted(anonId: string): Promise<boolean>;
  /** 原子消耗一次：并发下恰好一个成功；已用尽返回 false */
  consume(anonId: string): Promise<boolean>;
  /** 释放一次（补偿语义：扣了配额但业务写入失败时回退计数） */
  release(anonId: string): Promise<void>;
}

export const GUEST_QUOTA = Symbol('GUEST_QUOTA');
