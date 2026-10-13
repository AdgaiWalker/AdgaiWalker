/**
 * 发布进程端口（PRD A8 / TECH-DESIGN §5.2）
 * 唯一发布出口是 `scripts/content-publish.ts`；本端口只回答「跑一次并如实回报退出码与输出」。
 * 实现方负责把命令与参数固定为常量——调用方无法注入任何外部文本（无注入面）。
 */
export interface ReleaseProcessResult {
  /** 退出码；被信号终止（超时强杀）时为 null，属失败，不得当作成功 */
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  /** Whether the full process tree was proven to have exited. */
  exitProof: 'exited' | 'unproven';
}

export interface RunReleaseOptions {
  signal?: AbortSignal;
  onSpawn?: (pid: number) => void;
  lock?: { lockFile: string; lockId: string };
}

export interface ContentReleaseRunnerPort {
  runRelease(options?: RunReleaseOptions): Promise<ReleaseProcessResult>;
  terminateProcessTree?(pid: number): Promise<'exited' | 'unproven'>;
}

export const CONTENT_RELEASE_RUNNER = Symbol('CONTENT_RELEASE_RUNNER');
