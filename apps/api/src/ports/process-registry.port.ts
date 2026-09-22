export const PROCESS_REGISTRY = Symbol('PROCESS_REGISTRY');

export interface ProcessRecord {
  runId: string;
  bootId: string;
  pid: number | null;
  startedAt: string | null;
}

export type ProcessObservation = 'alive' | 'exited' | 'reused' | 'unproven';

/** runner 私有进程记录。核对必须同时看 PID 和启动时间。 */
export interface ProcessRegistryPort {
  currentBatch(): Promise<{ bootId: string; pid: number }>;
  inspect(record: ProcessRecord | null): Promise<ProcessObservation>;
  terminate(record: ProcessRecord | null): Promise<'exited' | 'unproven'>;
}
