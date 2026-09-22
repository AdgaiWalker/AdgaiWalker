/** 重启核对只看进程身份。PID 相同但启动时间不同，视为另一个进程。 */

export interface ProcessIdentity {
  pid: number;
  startedAt: string;
}

export type ProcessObservation = 'alive' | 'exited' | 'reused' | 'unproven';

export function sameProcess(left: ProcessIdentity, right: ProcessIdentity): boolean {
  return left.pid === right.pid && left.startedAt === right.startedAt;
}

/** 只有登记过的身份被证明已退出，才能释放容量。活着、被复用或无法证明都继续占用。 */
export function recoveryDisposition(observation: ProcessObservation): 'release' | 'occupy' {
  return observation === 'exited' ? 'release' : 'occupy';
}
