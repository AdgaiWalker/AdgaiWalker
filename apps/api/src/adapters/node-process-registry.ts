/**
 * 受控进程记录。身份规则复用已安装 Harness 0.1.5-rc.2 的 ProcessIdentity：
 * 同时核对 PID 与启动时间，不能只凭 PID 判断或终止。
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { ProcessObservation, ProcessRecord, ProcessRegistryPort } from '../ports/process-registry.port';

const bootId = randomUUID();

export function classifyProcessLookup(result: {
  error: boolean;
  status: number | null;
  stdout: string;
}): string | null | 'unreadable' {
  if (result.error || result.status === null) return 'unreadable';
  const text = result.stdout.trim();
  if (result.status === 0) {
    if (!text) return 'unreadable';
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? 'unreadable' : parsed.toISOString();
  }
  if (result.status === 1 && text === '') return null;
  return 'unreadable';
}

export class NodeProcessRegistry implements ProcessRegistryPort {
  async currentBatch() {
    return { bootId, pid: process.pid };
  }

  async inspect(record: ProcessRecord | null): Promise<ProcessObservation> {
    if (!record || record.pid === null || record.startedAt === null) return 'unproven';
    const observed = readStart(record.pid);
    if (observed === 'unreadable') return 'unproven';
    if (observed === null) return 'exited';
    return observed === record.startedAt ? 'alive' : 'reused';
  }

  async terminate(record: ProcessRecord | null): Promise<'exited' | 'unproven'> {
    if (!record || record.pid === null || record.startedAt === null) return 'unproven';
    const observed = readStart(record.pid);
    if (observed === 'unreadable' || observed !== record.startedAt) {
      return observed === null ? 'exited' : 'unproven';
    }
    try {
      process.kill(record.pid, 'SIGTERM');
    } catch {
      return readStart(record.pid) === null ? 'exited' : 'unproven';
    }
    return readStart(record.pid) === null ? 'exited' : 'unproven';
  }
}

function readStart(pid: number): string | null | 'unreadable' {
  if (!Number.isInteger(pid) || pid <= 0) return 'unreadable';
  const result = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' });
  return classifyProcessLookup({
    error: result.error !== undefined,
    status: result.status,
    stdout: result.stdout ?? '',
  });
}
