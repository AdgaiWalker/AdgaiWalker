export const PRODUCTION_STAGES = [
  'NORMALIZE',
  'EDIT',
  'QUALITY_CHECK',
  'FREEZE_BODY',
  'COVER',
  'WEB_FORMAT',
  'WECHAT_FORMAT',
  'REVIEW_READY',
] as const;

export type ProductionStage = (typeof PRODUCTION_STAGES)[number];
export const RECIPE_VERSION = 1 as const;

export const FIXED_RECIPE = {
  id: 'ai-content-v1',
  version: RECIPE_VERSION,
  stages: PRODUCTION_STAGES,
} as const;

export interface StageArtifact {
  recipeVersion: typeof RECIPE_VERSION;
  stage: ProductionStage;
  inputHash?: string;
  outputHash?: string;
  createdAt?: string;
  output: Record<string, unknown>;
}

export function validateStageArtifact(value: unknown, expectedStage?: ProductionStage): asserts value is StageArtifact {
  if (!value || typeof value !== 'object') throw new Error('invalid-stage-artifact');
  const artifact = value as Partial<StageArtifact>;
  if (artifact.recipeVersion !== RECIPE_VERSION) throw new Error('invalid-recipe-version');
  if (!PRODUCTION_STAGES.includes(artifact.stage as ProductionStage)) throw new Error('invalid-artifact-stage');
  if (expectedStage && artifact.stage !== expectedStage) throw new Error('invalid-artifact-stage');
  if (!artifact.output || typeof artifact.output !== 'object' || Array.isArray(artifact.output)) throw new Error('invalid-stage-output');
}
