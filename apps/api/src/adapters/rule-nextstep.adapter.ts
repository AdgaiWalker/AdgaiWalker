import { Injectable } from '@nestjs/common';
import { ruleNextStep } from '@walker/shared';
import type {
  NextStepResult,
  NextStepStrategyPort,
} from '../ports/nextstep.port';

/** 关 AI 默认策略：关键词五桶 */
@Injectable()
export class RuleNextStepAdapter implements NextStepStrategyPort {
  async generate(body: string): Promise<NextStepResult> {
    const r = ruleNextStep(body);
    return {
      nextStep: r.nextStep,
      bucketId: r.bucketId,
      aiUsedFlag: false,
    };
  }
}
