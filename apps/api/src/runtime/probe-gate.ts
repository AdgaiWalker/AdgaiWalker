import fs from 'node:fs';

export type RuntimeProbeReport = {
  local?: { status?: string };
};

/** 这台机器是 Mac 网页版，不以 Windows 探针作为放行条件。 */
export function runtimeProbePassed(report: RuntimeProbeReport | null): boolean {
  return report?.local?.status === 'pass';
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
