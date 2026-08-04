export type MvpEvidence = {
  workId: string;
  title: string;
  originalPresent: boolean;
  stageNames: string[];
  reviewReadyHash: string | null;
  landscapeCover: { width: number; height: number } | null;
  portraitCover: { width: number; height: number } | null;
  mobilePreview: boolean;
  exportComplete: boolean;
  recoveryVerified: boolean;
  websitePublished: boolean;
  wechatDraftSaved: boolean;
};

export type MvpEvidenceResult = { ok: boolean; failures: string[] };

const REQUIRED_STAGES = ['NORMALIZE', 'EDIT', 'QUALITY_CHECK', 'FREEZE_BODY', 'COVER', 'WEB_FORMAT', 'WECHAT_FORMAT', 'REVIEW_READY'];

export function evaluateMvpEvidence(evidence: MvpEvidence): MvpEvidenceResult {
  const failures: string[] = [];
  if (!evidence.originalPresent) failures.push('original-missing');
  if (!REQUIRED_STAGES.every((stage) => evidence.stageNames.includes(stage))) failures.push('stages-incomplete');
  if (!evidence.reviewReadyHash) failures.push('review-ready-missing');
  if (evidence.landscapeCover?.width !== 2100 || evidence.landscapeCover?.height !== 900) failures.push('landscape-cover-invalid');
  if (evidence.portraitCover?.width !== 900 || evidence.portraitCover?.height !== 1200) failures.push('portrait-cover-invalid');
  if (!evidence.mobilePreview) failures.push('mobile-preview-missing');
  if (!evidence.exportComplete) failures.push('export-incomplete');
  if (!evidence.recoveryVerified) failures.push('recovery-unverified');
  if (!evidence.websitePublished) failures.push('website-not-published');
  if (!evidence.wechatDraftSaved) failures.push('wechat-draft-not-saved');
  return { ok: failures.length === 0, failures };
}
