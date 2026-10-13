// 观测结果只有一份定义（shared），避免 port 与 shared 各写一遍后漂移。
import type { ProcessObservation } from '@walker/shared';

export type { ProcessObservation };

export const PROCESS_REGISTRY = Symbol('PROCESS_REGISTRY');

export interface ProcessRecord {
  runId: string;
  bootId: string;
  pid: number | null;
  startedAt: string | null;
}



/** runner 私有进程记录。核对必须同时看 PID 和启动时间。 */
export interface ProcessRegistryPort {
  currentBatch(): Promise<{ bootId: string; pid: number }>;
  inspect(record: ProcessRecord | null): Promise<ProcessObservation>;
  terminate(record: ProcessRecord | null): Promise<'exited' | 'unproven'>;
}
