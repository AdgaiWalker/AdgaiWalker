import fs from 'node:fs/promises';
import path from 'node:path';
import { evaluateMvpEvidence, type MvpEvidence } from '../packages/shared/dist/mvp-acceptance.js';

const STAGES = ['NORMALIZE', 'EDIT', 'QUALITY_CHECK', 'FREEZE_BODY', 'COVER', 'WEB_FORMAT', 'WECHAT_FORMAT', 'REVIEW_READY'] as const;
const WORK_ROOT = path.resolve(process.env.WORK_ROOT_DIR?.trim() || 'var/works');
const configuredExportRoot = process.env.MVP_EXPORT_ROOT?.trim() || 'D:/walker-exports-v3';
const EXPORT_ROOT = path.resolve(configuredExportRoot);
const API_URL = process.env.WORKSTATION_URL?.trim() || 'http://127.0.0.1:8790';

type JsonRecord = Record<string, unknown>;

async function exists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function readJson(filePath: string): Promise<JsonRecord> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as JsonRecord;
}

function svgSize(value: unknown): { width: number; height: number } | null {
  if (typeof value !== 'string') return null;
  const width = Number(value.match(/\bwidth="(\d+)"/)?.[1]);
  const height = Number(value.match(/\bheight="(\d+)"/)?.[1]);
  return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : null;
}

async function latestStage(workDir: string, stage: string): Promise<{ file: string; artifact: JsonRecord } | null> {
  const dir = path.join(workDir, 'stages', stage);
  if (!(await exists(dir))) return null;
  const files = (await fs.readdir(dir)).filter((file) => file.endsWith('.json')).sort();
  const file = files.at(-1);
  return file ? { file, artifact: await readJson(path.join(dir, file)) } : null;
}

async function apiWorks(): Promise<Map<string, JsonRecord>> {
  try {
    const response = await fetch(`${API_URL}/works`);
    if (!response.ok) return new Map();
    const works = await response.json() as JsonRecord[];
    return new Map(works.map((work) => [String(work.id), work]));
  } catch {
    return new Map();
  }
}

async function auditWork(workId: string, api: Map<string, JsonRecord>): Promise<{ evidence: MvpEvidence; result: ReturnType<typeof evaluateMvpEvidence> }> {
  const workDir = path.join(WORK_ROOT, workId);
  const manifestPath = path.join(workDir, 'manifest.json');
  const manifest = await readJson(manifestPath);
  const latest = new Map<string, { file: string; artifact: JsonRecord }>();
  for (const stage of STAGES) {
    const item = await latestStage(workDir, stage);
    if (item) latest.set(stage, item);
  }
  const review = latest.get('REVIEW_READY');
  const reviewOutput = (review?.artifact.output ?? {}) as JsonRecord;
  const packagePath = path.join(workDir, 'publish', 'wechat.json');
  const packageData = await readJson(packagePath);
  const stageCounts = await Promise.all(STAGES.map(async (stage) => {
    const dir = path.join(workDir, 'stages', stage);
    if (!(await exists(dir))) return 0;
    return (await fs.readdir(dir)).filter((file) => file.endsWith('.json')).length;
  }));
  const exportDir = path.join(EXPORT_ROOT, workId);
  const exportedStages = await Promise.all(STAGES.map((stage) => exists(path.join(exportDir, 'stages', stage))));
  const apiWork = api.get(workId) ?? {};
  const evidence: MvpEvidence = {
    workId,
    title: String(manifest.title ?? reviewOutput.title ?? workId),
    originalPresent: Array.isArray(manifest.originalFiles) && manifest.originalFiles.length > 0 && await exists(path.join(workDir, 'original')),
    stageNames: [...latest.keys()],
    reviewReadyHash: review ? review.file.match(/^[^-]+-(.+)\.json$/)?.[1] ?? null : null,
    landscapeCover: svgSize(reviewOutput.landscapeCover),
    portraitCover: svgSize(reviewOutput.portraitCover),
    mobilePreview: typeof packageData.mobilePreviewHtml === 'string' && packageData.mobilePreviewHtml.includes('data-preview-width="390"'),
    exportComplete: await exists(path.join(exportDir, 'manifest.json')) && await exists(path.join(exportDir, 'original')) && exportedStages.every(Boolean) && await exists(path.join(exportDir, 'publish', 'wechat.json')),
    recoveryVerified: stageCounts.some((count) => count >= 3),
    websitePublished: apiWork.status === 'PUBLISHED' || apiWork.websitePublicationStatus === 'PUBLISHED' || apiWork.websiteVerified === true,
    wechatDraftSaved: apiWork.wechatPublicationStatus === 'DRAFT_SAVED' || apiWork.wechatDraftSaved === true,
  };
  return { evidence, result: evaluateMvpEvidence(evidence) };
}

async function main(): Promise<void> {
  const ids = (process.env.MVP_WORK_IDS?.split(',').map((id) => id.trim()).filter(Boolean) ?? []).length
    ? process.env.MVP_WORK_IDS!.split(',').map((id) => id.trim()).filter(Boolean)
    : (await fs.readdir(WORK_ROOT)).filter((id) => !id.startsWith('.'));
  const api = await apiWorks();
  const reports = [];
  for (const workId of ids) {
    const report = await auditWork(workId, api);
    reports.push(report);
    console.log(JSON.stringify(report));
  }
  const failures = reports.flatMap((report) => report.result.failures.map((failure) => `${report.evidence.workId}:${failure}`));
  if (reports.length < 3) failures.push(`expected-three-works:got-${reports.length}`);
  if (failures.length > 0) {
    console.error(`MVP acceptance failed: ${failures.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`MVP acceptance passed: ${reports.length} works`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
