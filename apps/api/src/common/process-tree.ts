/**
 * 受控进程树工具（TECH-DESIGN §10.3 / C19）
 * 职责：
 * 1. 递归查询进程树中的所有子进程 PID，不漏掉构建派生的任何进程；
 * 2. 终止进程树（POSIX 进程组 / Windows taskkill /T /F / SIGTERM / SIGKILL）；
 * 3. 轮询核验整棵树中的所有进程确实已全部退出（杜绝孤儿僵尸进程占满 2C2G 资源，不杀其他程序）。
 */
import { spawnSync } from 'node:child_process';

/** 检查指定 pid 当前是否存活 */
export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    // ESRCH: 进程不存在；EPERM: 进程存在但无权限向其发信号（也是存活）
    return (err as { code?: string })?.code === 'EPERM';
  }
}

/** 递归获取给定根进程的所有后代 PID */
export function getProcessDescendants(rootPid: number, visited = new Set<number>()): number[] {
  if (!Number.isInteger(rootPid) || rootPid <= 0 || visited.has(rootPid)) return [];
  visited.add(rootPid);
  const pids: number[] = [];

  if (process.platform === 'win32') {
    try {
      const res = spawnSync('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${rootPid} } | Select-Object -ExpandProperty ProcessId`,
      ], { encoding: 'utf8', windowsHide: true });
      if (res.status === 0 && res.stdout) {
        const lines = res.stdout.trim().split(/\r?\n/).map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
        for (const childPid of lines) {
          pids.push(childPid, ...getProcessDescendants(childPid, visited));
        }
      }
    } catch {
      // 容错处理
    }
  } else {
    try {
      const res = spawnSync('pgrep', ['-P', String(rootPid)], { encoding: 'utf8' });
      if (res.status === 0 && res.stdout) {
        const lines = res.stdout.trim().split(/\s+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
        for (const childPid of lines) {
          pids.push(childPid, ...getProcessDescendants(childPid, visited));
        }
      }
    } catch {
      // 容错处理
    }
  }

  return [...new Set(pids)];
}

/**
 * 终止指定进程及其整棵后代进程树，并核验是否完全退出。
 * 绝不留下活跃构建占资源，不杀其他程序。
 */
export async function terminateAndVerifyProcessTree(
  rootPid: number,
  timeoutMs = 3000,
): Promise<'exited' | 'unproven'> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) return 'exited';

  // 1. 先收集整棵树的所有 PID（包含 rootPid 与所有子进程）
  const allPids = [rootPid, ...getProcessDescendants(rootPid)];

  // 2. 发送终止信号
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/PID', String(rootPid), '/T', '/F'], { windowsHide: true });
    } catch {
      for (const p of allPids) {
        try { process.kill(p); } catch {}
      }
    }
  } else {
    try {
      process.kill(-rootPid, 'SIGTERM');
    } catch {
      for (const p of allPids) {
        try { process.kill(p, 'SIGTERM'); } catch {}
      }
    }
  }

  // 3. 轮询核验所有 PID 是否已退出
  const startTime = Date.now();
  let escalatedToKill = false;

  while (Date.now() - startTime < timeoutMs) {
    const remaining = allPids.filter(isPidAlive);
    if (remaining.length === 0) {
      return 'exited';
    }

    if (!escalatedToKill && Date.now() - startTime > Math.min(1000, timeoutMs / 2)) {
      escalatedToKill = true;
      if (process.platform !== 'win32') {
        try {
          process.kill(-rootPid, 'SIGKILL');
        } catch {
          for (const p of remaining) {
            try { process.kill(p, 'SIGKILL'); } catch {}
          }
        }
      }
    }

    await new Promise((r) => setTimeout(r, 50));
  }

  const remaining = allPids.filter(isPidAlive);
  return remaining.length === 0 ? 'exited' : 'unproven';
}
