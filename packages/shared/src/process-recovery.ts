/** 重启核对只看进程身份。PID 相同但启动时间不同，视为另一个进程。 */

export interface ProcessIdentity {
  pid: number;
  startedAt: string;
}

/**
 * 进程观测结果。
 *
 * `unstarted` 与 `unproven` **必须分开**（2026-09-24 实测教训）：
 * 前者表示「从未真正启动过进程」（ProcessRecord 没有 pid），没有任何东西需要终止，
 * 释放容量是安全的；后者表示「启动过但无法证明它是否还活着」，保守起见继续占用。
 * 原先两者都归为 unproven 并一律 occupy，于是一条 pid 为空的记录会把
 * **唯一的模型槽永久占死**——泵一直 waiting、队列永不推进，整个系统越用越不可用。
 * 这与「无法证明终止就继续占用」并不冲突：没启动过，就无所谓终止。
 */
export type ProcessObservation = 'alive' | 'exited' | 'reused' | 'unstarted' | 'unproven';

export function sameProcess(left: ProcessIdentity, right: ProcessIdentity): boolean {
  return left.pid === right.pid && left.startedAt === right.startedAt;
}

/** 只有登记过的身份被证明已退出（或从未启动）才能释放容量。活着、被复用或无法证明都继续占用。 */
export function recoveryDisposition(observation: ProcessObservation): 'release' | 'occupy' {
  return observation === 'exited' || observation === 'unstarted' ? 'release' : 'occupy';
}
