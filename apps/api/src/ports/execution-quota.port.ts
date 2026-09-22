export const EXECUTION_QUOTA = Symbol('EXECUTION_QUOTA');

export type ReserveResult = 'reserved' | 'exhausted' | 'uncharged' | 'held' | 'charged' | 'released';

/** 预留必须走调用方传入的同一个数据库事务。结算和释放各自原子完成。 */
export interface ExecutionQuotaPort {
  reserve(client: object, runId: string, grantId: string | null): Promise<ReserveResult>;
  settle(runId: string): Promise<'charged' | 'unchanged'>;
  release(runId: string): Promise<void>;
}
