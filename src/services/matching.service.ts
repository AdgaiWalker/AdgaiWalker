/**
 * 匹配服务 — 需求分类 + 工具推荐
 *
 * 从 /api/match.ts 和 agent/match.ts 拆出的业务逻辑。
 * 只做匹配计算，不处理 HTTP、速率限制、持久化。
 */

import { matchSiteResources, type MatchContext, type MatchResult } from '@/agent/match';
import type { MatchingServicePort } from './interfaces';

export function createMatchingService(): MatchingServicePort {
  return {
    async matchNeed(input) {
      const context: MatchContext = {
        need: input.need,
        audienceGroup: input.audienceGroup as MatchContext['audienceGroup'],
        aiStage: input.aiStage as MatchContext['aiStage'],
      };

      const result: MatchResult = matchSiteResources(context);

      return {
        responseMode: result.responseMode,
        categories: result.categories,
        resources: result.resources,
        recommendedTools: result.recommendedTools,
        needFrame: result.needFrame,
        diagnosisOptions: result.diagnosisOptions,
        actionPlan: result.actionPlan,
        bridge: result.bridge,
        frictionLayer: result.frictionLayer,
        recommendedAbilityType: result.recommendedAbilityType,
        toolDirection: result.toolDirection,
        reason: result.reason,
        complianceRedirected: result.complianceRedirected,
        codeAgentMisuseLikely: result.codeAgentMisuseLikely,
      };
    },
  };
}
