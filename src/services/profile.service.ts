/**
 * 用户画像服务 — 自报锚点的读取 / 保存 / 删除请求
 *
 * 画像模型：自报锚点（personaAnchor，≤10 字）+ 遭遇切片（在 AgentOrchestrator 推断）。
 * 零 PII：锚点写入前过 redactSensitiveText，命中手机号/邮箱等抛 PersonaAnchorPiiError。
 * confidence：锚点填了=1，没填=0。
 */

import { randomUUID } from 'node:crypto';

import { redactSensitiveText } from '@/agent/privacy';
import { redactNeedCasesBySession } from '@/conversation/store';
import type { ProfileInput, UserProfileServicePort } from './interfaces';
import type { UserProfile, UserProfileRepositoryPort } from '@/stores/ports';

const ANCHOR_MAX_LENGTH = 10;

/** 锚点命中 PII 时抛出，由 API 层捕获返回 400 */
export class PersonaAnchorPiiError extends Error {
  constructor() {
    super('persona anchor contains pii');
    this.name = 'PersonaAnchorPiiError';
  }
}

function computeConfidence(anchor: string | undefined): number {
  return anchor && anchor.trim().length > 0 ? 1 : 0;
}

/** 锚点 PII 检测 + 长度截断：命中手机号/邮箱等抛错（零 PII 红线） */
export function validatePersonaAnchor(anchor: string | undefined): string | undefined {
  if (!anchor) return undefined;
  const trimmed = anchor.trim();
  if (!trimmed) return undefined;
  // 先 PII 检测（用完整文本，避免截断后 11 位手机号变 10 位逃过正则）
  const { piiDetected } = redactSensitiveText(trimmed);
  if (piiDetected) throw new PersonaAnchorPiiError();
  // 再截断到 10 字（双保险，前端 maxlength=10 已限）
  return trimmed.length > ANCHOR_MAX_LENGTH ? trimmed.slice(0, ANCHOR_MAX_LENGTH) : trimmed;
}

export function createUserProfileService(deps: {
  profileStore: UserProfileRepositoryPort;
}): UserProfileServicePort {
  return {
    async get(sessionId: string): Promise<UserProfile | null> {
      return deps.profileStore.findBySessionId(sessionId);
    },

    async upsert(sessionId: string, input: ProfileInput): Promise<UserProfile> {
      const existing = await deps.profileStore.findBySessionId(sessionId);
      const now = new Date().toISOString();

      const personaAnchor = input.personaAnchor !== undefined
        ? validatePersonaAnchor(input.personaAnchor)
        : existing?.personaAnchor;

      const profile: UserProfile = {
        profileId: existing?.profileId ?? randomUUID(),
        sessionId,
        inviteCodeHash: existing?.inviteCodeHash,
        personaAnchor,
        nickname: input.nickname ?? existing?.nickname,
        consentForProfile: true,
        deleteRequestedAt: existing?.deleteRequestedAt,
        confidence: computeConfidence(personaAnchor),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      await deps.profileStore.save(profile);
      return profile;
    },

    async requestDeletion(sessionId: string): Promise<void> {
      await deps.profileStore.markDeleteRequested(sessionId, new Date().toISOString());
      // 关联脱敏（A8）：清空该 session 所有 NeedCase 的 rawNeedRedacted / profileSnapshot
      try {
        await redactNeedCasesBySession(sessionId);
      } catch {
        // 脱敏失败不阻断删除请求（deleteRequestedAt 已标记）
      }
    },
  };
}
