import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  isPidAlive,
  terminateAndVerifyProcessTree,
} from './process-tree';

describe('受控进程树工具（process-tree）', () => {
  it('isPidAlive 准确判断当前进程与不存在进程的存活状态', () => {
    expect(isPidAlive(process.pid)).toBe(true);
    // 不合法或不存在的大 PID
    expect(isPidAlive(-1)).toBe(false);
    expect(isPidAlive(0)).toBe(false);
    expect(isPidAlive(9999999)).toBe(false);
  });

  it('terminateAndVerifyProcessTree 终止派生子进程并核验确认已全灭退出', async () => {
    // 启动一个多层派生进程树：父进程启动一个子进程并 sleep 30s
    const script = `
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      setInterval(() => {}, 1000);
    `;
    const parent = spawn(process.execPath, ['-e', script], {
      stdio: 'ignore',
      detached: process.platform !== 'win32',
    });

    const parentPid = parent.pid!;
    expect(isPidAlive(parentPid)).toBe(true);

    // 等待子进程派生完毕
    await new Promise((r) => setTimeout(r, 200));

    // 执行进程树终止并核验
    const status = await terminateAndVerifyProcessTree(parentPid, 3000);

    expect(status).toBe('exited');
    expect(isPidAlive(parentPid)).toBe(false);
  });

  it('对已不存在的 PID 执行 terminateAndVerifyProcessTree 幂等返回 exited', async () => {
    const status = await terminateAndVerifyProcessTree(9999999, 100);
    expect(status).toBe('exited');
  });
});
