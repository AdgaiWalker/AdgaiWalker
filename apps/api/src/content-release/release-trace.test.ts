import { describe, expect, it } from 'vitest';
import {
  RELEASE_MESSAGE_MAX_BYTES,
  RELEASE_TAIL_LINES,
  extractReleaseOutputTail,
  fitReleaseMessage,
  parseJsonReport,
  redactAbsolutePaths,
} from './release-trace';

describe('release-trace（轨迹提取与脱敏）', () => {
  it('优先提取最后一行 JSON tail，无法解析时回落 stdout/stderr 并裁剪尾部行数', () => {
    expect(parseJsonReport('noise\n{"tail":["a","b",123]}\n')).toEqual({ tail: ['a', 'b'] });
    expect(parseJsonReport('plain stdout only')).toBeNull();

    const fromJson = extractReleaseOutputTail({
      exitCode: 0,
      timedOut: false,
      exitProof: 'exited',
      stdout: 'ignored\n{"tail":["C:\\\\Walker\\\\app\\\\a.ts done","/Users/happy/file.md ok"]}\n',
      stderr: '',
    });
    expect(fromJson).toEqual(['<path> done', '<path> ok']);

    const manyLines = Array.from({ length: 20 }, (_, i) => `line-${i}`).join('\n');
    const fallback = extractReleaseOutputTail({
      exitCode: 1,
      timedOut: true,
      exitProof: 'unproven',
      stdout: manyLines,
      stderr: 'err-tail',
    });
    expect(fallback).toHaveLength(RELEASE_TAIL_LINES);
    expect(fallback[0]).toBe('line-9');
    expect(fallback[fallback.length - 1]).toBe('err-tail');
  });

  it('按 JSON 转义后字节数裁剪错误消息且绝不截破转义信封', () => {
    expect(redactAbsolutePaths('fail at /var/folders/x and C:\\Walker\\app\\k.ts')).toBe(
      'fail at <path> and <path>',
    );
    const heavy = '中文"换行\n'.repeat(400);
    const fitted = fitReleaseMessage(heavy);
    expect(fitted.length).toBeGreaterThan(0);
    expect(Buffer.byteLength(JSON.stringify(fitted), 'utf8')).toBeLessThanOrEqual(
      RELEASE_MESSAGE_MAX_BYTES,
    );
  });
});
