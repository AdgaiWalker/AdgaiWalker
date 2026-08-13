import { describe, expect, it } from 'vitest';
import { evaluateMvpEvidence, type MvpEvidence } from './mvp-acceptance.js';

const completeEvidence: MvpEvidence = {
  workId: 'work-1',
  title: 'A real work',
  originalPresent: true,
  stageNames: ['NORMALIZE', 'EDIT', 'QUALITY_CHECK', 'FREEZE_BODY', 'COVER', 'WEB_FORMAT', 'WECHAT_FORMAT', 'REVIEW_READY'],
  reviewReadyHash: 'hash-1',
  landscapeCover: { width: 2100, height: 900 },
  portraitCover: { width: 900, height: 1200 },
  mobilePreview: true,
  exportComplete: true,
  recoveryVerified: true,
  websitePublished: true,
  wechatDraftSaved: true,
};

describe('evaluateMvpEvidence', () => {
  it('accepts a work only when every required proof is present', () => {
    expect(evaluateMvpEvidence(completeEvidence)).toEqual({ ok: true, failures: [] });
  });

  it('reports external publication gaps without hiding local evidence', () => {
    const result = evaluateMvpEvidence({ ...completeEvidence, websitePublished: false, wechatDraftSaved: false });
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(['website-not-published', 'wechat-draft-not-saved']);
  });
});
