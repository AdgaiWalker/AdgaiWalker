import { Injectable } from '@nestjs/common';
import { DEFAULT_QUICK_REPLIES, ruleNextStep } from '@walker/shared';
import type {
  NextStepOptions,
  NextStepResult,
  NextStepStrategyPort,
} from '../ports/nextstep.port';

/** 关 AI 默认策略：关键词五桶 */
@Injectable()
export class RuleNextStepAdapter implements NextStepStrategyPort {
  async generate(body: string, _options?: NextStepOptions): Promise<NextStepResult> {
    const r = ruleNextStep(body);
    return {
      nextStep: r.nextStep,
      bucketId: r.bucketId,
      aiUsedFlag: false,
      suggestedSlug: null,
      suggestedTitle: null,
      quickReplies: DEFAULT_QUICK_REPLIES[r.bucketId] ?? DEFAULT_QUICK_REPLIES.default,
    };
  }
}
