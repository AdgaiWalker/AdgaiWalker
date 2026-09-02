export interface NextStepResult {
  nextStep: string;
  bucketId: string;
  aiUsedFlag: boolean;
  /** AI 策略可带至多一篇可引用文章推荐；规则版恒为 null */
  suggestedSlug?: string | null;
  /** 与 suggestedSlug 配套的站内标题（取自内容索引，不信任模型原文） */
  suggestedTitle?: string | null;
}

export interface NextStepStrategyPort {
  generate(body: string): Promise<NextStepResult>;
}

export const NEXT_STEP_STRATEGY = Symbol('NEXT_STEP_STRATEGY');
