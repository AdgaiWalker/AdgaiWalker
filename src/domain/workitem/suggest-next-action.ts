/**
 * domain/workitem/suggest-next-action —— Outcome → 下一步候选动作建议（P1-E02）
 *
 * 从 `src/services/workbench.service.ts` 搬迁（原 L489-550）。
 * 纯函数，不读取存储、不产生副作用；只产出"建议"，由 Walker 决定是否创建新 Action。
 *
 * 映射来源（综合实施方案 P1-E02 表格）：
 *   successful              → 保持，观察是否形成 Experience/Rule 候选（evaluate-asset）
 *   partial                 → 按用户场景拆分内容或补适用边界（create-content）
 *   failed                  → 复核方向，更新或下线（update-content）
 *   inconclusive            → 延长观察或创建 LearningRequest（create-learning-request）
 */

import type { WorkItemActionType, WorkItemOutcomeResult } from '@/stores/ports';

/** 候选动作建议（不自动执行） */
export interface NextActionSuggestion {
  /** 建议的动作类型（用于创建新 Action） */
  suggestedActionType: WorkItemActionType;
  /** 给 Walker 看的建议说明 */
  reason: string;
  /** 建议的预期结果文案（用于预填 Action.expectedOutcome） */
  suggestedExpectedOutcome: string;
}

/**
 * 根据已记录的 Outcome 结果派生下一步候选动作。
 *
 * 纯函数：相同输入恒等输出，不读取存储、不产生副作用。
 *
 * @param input.result          结果判定（successful/partial/failed/inconclusive）
 * @param input.outcomeSummary  结果摘要（当前实现未使用，保留入参形状以便后续扩展）
 * @returns 命中映射时返回建议对象；未知结果返回 null
 */
export function suggestNextAction(input: {
  result: WorkItemOutcomeResult;
  outcomeSummary: string;
}): NextActionSuggestion | null {
  switch (input.result) {
    case 'successful':
      // 保持，观察是否形成 Experience/Rule 候选
      return {
        suggestedActionType: 'evaluate-asset',
        reason: '内容有效且边界稳定。观察是否形成可复用的 Experience / Rule 候选，沉淀为资产。',
        suggestedExpectedOutcome: '评估该内容是否值得沉淀为 Experience 或 Rule 候选',
      };
    case 'partial':
      // mixed：按用户场景拆分内容或补适用边界
      return {
        suggestedActionType: 'create-content',
        reason: '结果部分有效。不同用户场景可能需要拆分内容，或补充适用边界说明。',
        suggestedExpectedOutcome: '按用户场景拆分内容或补充适用边界',
      };
    case 'failed':
      // 明确失败：复核方向
      return {
        suggestedActionType: 'update-content',
        reason: '内容未能解决问题。需要复核方向、重写或重新定位，再决定更新还是下线。',
        suggestedExpectedOutcome: '复核内容方向，决定更新或下线',
      };
    case 'inconclusive':
      // 证据不足：延长观察或创建 LearningRequest
      return {
        suggestedActionType: 'create-learning-request',
        reason: '结果不足以判断。延长观察，或创建 LearningRequest 补充实践 / 反例 / 访谈。',
        suggestedExpectedOutcome: '补充实践、反例或访谈证据后再判断',
      };
    default:
      return null;
  }
}
