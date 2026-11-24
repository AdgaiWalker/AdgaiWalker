import type { ReleaseProcessResult } from '../ports/content-release-runner.port';

/** 输出尾部保留行数（PRD A10：失败回显原始输出尾部若干行） */
export const RELEASE_TAIL_LINES = 12;
/** run.error.message 的字节上限：按 JSON 转义后计（引号/换行会膨胀），留出信封余量保证 payload ≤2000B */
export const RELEASE_MESSAGE_MAX_BYTES = 1_400;
/** 绝对路径一律脱敏：轨迹 payload 禁放绝对路径（TECH-DESIGN §4.1/§8 #5） */
export const ABSOLUTE_PATH_RE =
  /(?:[A-Za-z]:\\[^\s"']+|\/(?:Users|home|var|tmp|private|opt|mnt)\/[^\s"']*)/g;

/**
 * 解析脚本 `--json` 回报（最后一行 JSON）。
 * 解析不到返回 null —— 进程被超时强杀时根本没有机会输出，此时退回原始 stdout/stderr（如实）。
 */
export function parseJsonReport(stdout: string): { tail: string[] } | null {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (!line.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(line) as { tail?: unknown };
      if (Array.isArray(parsed.tail)) {
        return {
          tail: parsed.tail.filter((item): item is string => typeof item === 'string'),
        };
      }
    } catch {
      /* 不是 JSON 行：继续往前找 */
    }
  }
  return null;
}

export function redactAbsolutePaths(line: string): string {
  return line.replace(ABSOLUTE_PATH_RE, '<path>');
}

export function fitReleaseMessage(text: string): string {
  let out = text;
  while (
    out.length > 0 &&
    Buffer.byteLength(JSON.stringify(out), 'utf8') > RELEASE_MESSAGE_MAX_BYTES
  ) {
    out = out.slice(0, Math.max(0, out.length - 64));
  }
  return out;
}

/**
 * 输出尾部：优先用 `--json` 回报的 tail，解析不到则退回原始 stdout/stderr；
 * 统一脱敏绝对路径并按行裁剪。
 */
export function extractReleaseOutputTail(result: ReleaseProcessResult): string[] {
  const report = parseJsonReport(result.stdout);
  const source = report ? report.tail.join('\n') : `${result.stdout}\n${result.stderr}`;
  return source
    .split('\n')
    .map((line) => redactAbsolutePaths(line.trim()))
    .filter((line) => line.length > 0)
    .slice(-RELEASE_TAIL_LINES);
}
