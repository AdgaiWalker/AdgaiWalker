/**
 * 反馈服务 — 保存反馈并回写 Need Case
 *
 * 每条反馈同时写入 MatchFeedbackEvent 和对应 Need Case 的 feedbackStatus，
 * 形成反馈到原始需求的闭环。
 */

import { randomUUID } from 'node:crypto';

import { compactText, redactSensitiveText } from '@/agent/privacy';
import type { FeedbackServicePort } from './interfaces';
import type {
  FeedbackRepositoryPort,
  FeedbackStatus,
  MatchFeedbackEvent,
  MatchFeedbackType,
  NeedCaseRepositoryPort,
} from '@/stores/ports';

const FEEDBACK_TO_STATUS: Record<MatchFeedbackType, FeedbackStatus> = {
  resolved: 'resolved',
  stuck: 'stuck',
  'not-fit': 'not-fit',
  'want-tutorial': 'want-tutorial',
  'first-draft': 'first-draft',
  'next-step-clear': 'next-step-clear',
  'wrong-direction': 'wrong-direction',
  'need-tutorial': 'need-tutorial',
};

export function createFeedbackService(deps: {
  feedbackStore: FeedbackRepositoryPort;
  needCaseStore: NeedCaseRepositoryPort;
}): FeedbackServicePort {
  return {
    async submit(input) {
      const feedbackText = input.feedbackText
        ? redactSensitiveText(compactText(input.feedbackText, 240)).text
        : undefined;

      const feedbackId = randomUUID();
      const event: MatchFeedbackEvent = {
        feedbackId,
        needCaseId: input.needCaseId,
        sessionId: input.sessionId,
        createdAt: new Date().toISOString(),
        feedbackType: input.feedbackType,
        feedbackText,
      };
      await deps.feedbackStore.save(event);

      // 回写 Need Case feedbackStatus（失败不阻断反馈保存）
      if (input.needCaseId) {
        const status = FEEDBACK_TO_STATUS[input.feedbackType] ?? 'none';
        try {
          await deps.needCaseStore.updateFeedback(input.needCaseId, status);
        } catch {
          /* Need Case 回写失败不影响反馈本身 */
        }
      }

      return { feedbackId, needCaseId: input.needCaseId };
    },
  };
}
