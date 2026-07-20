export interface NextStepResult {
  nextStep: string;
  bucketId: string;
  aiUsedFlag: boolean;
}

export interface NextStepStrategyPort {
  generate(body: string): Promise<NextStepResult>;
}

export const NEXT_STEP_STRATEGY = Symbol('NEXT_STEP_STRATEGY');
