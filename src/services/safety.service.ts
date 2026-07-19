/**
 * 安全服务 — 输入评估 + 事件记录
 *
 * 第一批只覆盖 PII 脱敏 + 未成年人标记 + 事件记录。
 * AI 调用失败、Need Case 保存失败等由调用方通过 recordIncident 上报。
 */

import { randomUUID } from 'node:crypto';

import { compactText, isMinorAudience, redactSensitiveText } from '@/agent/privacy';
import type { SafetyServicePort } from './interfaces';
import type { IncidentRepositoryPort, SafetyDecision } from '@/stores/ports';

export function createSafetyService(deps: {
  incidentStore: IncidentRepositoryPort;
}): SafetyServicePort {
  return {
    assessInput(text: string, audienceGroup?: string): SafetyDecision {
      const isMinor = isMinorAudience(audienceGroup);
      const redacted = redactSensitiveText(compactText(text, 500));
      return {
        action: 'allow',
        reason: redacted.piiDetected ? '检测到潜在敏感信息，已自动脱敏。' : '通过',
        redactedText: redacted.text,
        piiDetected: redacted.piiDetected,
        isMinorContext: isMinor,
      };
    },

    async recordIncident(input): Promise<void> {
      await deps.incidentStore.save({
        incidentId: randomUUID(),
        createdAt: new Date().toISOString(),
        scope: input.scope,
        severity: input.severity,
        message: input.message,
        relatedNeedCaseId: input.relatedNeedCaseId,
        relatedSessionId: input.relatedSessionId,
        resolved: false,
      });
    },
  };
}
