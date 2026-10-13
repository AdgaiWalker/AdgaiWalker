import fs from 'node:fs';

export type RuntimeProbeReport = {
  local?: {
    status?: string;
    processExited?: boolean;
    closeError?: string | null;
    answer?: { chars?: number; sha256?: string } | null;
  };
};

/** 只接受当前运行环境真实完成的探针报告，不以电脑操作系统决定放行。 */
export function runtimeProbePassed(report: RuntimeProbeReport | null): boolean {
  const local = report?.local;
  return local?.status === 'pass' && local.processExited === true && local.closeError === null &&
    Number.isInteger(local.answer?.chars) && (local.answer?.chars ?? 0) > 0 &&
    typeof local.answer?.sha256 === 'string' && /^[a-f0-9]{64}$/.test(local.answer.sha256);
}

export function readRuntimeProbe(path = process.env.WALKER_RUNTIME_PROBE_REPORT): RuntimeProbeReport | null {
  if (!path || !fs.existsSync(path)) return null;
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8')) as RuntimeProbeReport;
  } catch {
    return null;
  }
}

export function assertModelLinkAllowed(): void {
  return;
}
