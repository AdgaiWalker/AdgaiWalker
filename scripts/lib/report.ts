/**
 * report — 验收 pass/fail 计数与落盘
 * 依赖：node:fs、paths.tmpDir
 * 被调用：accept-dual-entry、accept-deep
 */
import fs from 'node:fs';
import path from 'node:path';
import { tmpDir } from './paths';

export type ReportItem = { name: string; ok: boolean; detail: string };

export function createReport() {
  let failed = 0;
  const items: ReportItem[] = [];

  function pass(name: string, detail = ''): void {
    items.push({ name, ok: true, detail });
    console.log('PASS', name, detail ? `— ${detail}` : '');
  }

  function fail(name: string, detail = ''): void {
    failed += 1;
    items.push({ name, ok: false, detail });
    console.error('FAIL', name, detail ? `— ${detail}` : '');
  }

  function writeJson(filename: string, extra: Record<string, unknown> = {}): void {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, filename),
      JSON.stringify({ at: new Date().toISOString(), failed, items, ...extra }, null, 2),
    );
  }

  function exitWithSummary(label: string): never {
    console.log(
      failed === 0
        ? `\n${label} PASS (${items.length})`
        : `\n${label} FAIL ${failed}/${items.length}`,
    );
    process.exit(failed === 0 ? 0 : 1);
  }

  return {
    pass,
    fail,
    writeJson,
    exitWithSummary,
    get failed() {
      return failed;
    },
    get items() {
      return items;
    },
  };
}
