export const EXECUTION_QUOTA = Symbol('EXECUTION_QUOTA');

export type ReserveResult = 'reserved' | 'exhausted' | 'uncharged' | 'held' | 'charged' | 'released';

/** 预留必须走调用方传入的同一个数据库事务。结算和释放各自原子完成。 */
export interface ExecutionQuotaPort {
  reserve(client: object, runId: string, grantId: string | null): Promise<ReserveResult>;
  settle(runId: string): Promise<'charged' | 'unchanged'>;
  /**
   * 把这次运行真实消耗的 token 记进授权额度。
   *
   * 预留时无法预知 token 数，所以 token 只能**终态记账**；`usageLimit` 因此在
   * 「已累计消耗」上判定——`reserve` 的 WHERE 里已经带了这一条，但此前没有任何
   * 代码喂数据，`usageLimit` 是个永远为 0 的装饰字段。同一条运行只记一次。
   */
  recordUsage(runId: string, tokens: number): Promise<void>;
  release(runId: string): Promise<void>;
}
