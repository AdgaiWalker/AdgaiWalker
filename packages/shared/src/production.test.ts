import { describe, expect, it } from 'vitest';
import { FIXED_RECIPE, validateStageArtifact } from './production';

describe('fixed production recipe', () => {
  it('keeps the seven production stages in order', () => {
    expect(FIXED_RECIPE.stages).toEqual(['NORMALIZE', 'EDIT', 'QUALITY_CHECK', 'FREEZE_BODY', 'COVER', 'WEB_FORMAT', 'WECHAT_FORMAT', 'REVIEW_READY']);
  });

  it('rejects a stage artifact with the wrong recipe version or stage', () => {
    expect(() => validateStageArtifact({ recipeVersion: 2, stage: 'EDIT', output: {} })).toThrow('invalid-recipe-version');
    expect(() => validateStageArtifact({ recipeVersion: 1, stage: 'NORMALIZE', output: {} }, 'EDIT')).toThrow('invalid-artifact-stage');
  });
});
