/**
 * Asset Service —— 资产统一晋升链路（P2-B）
 *
 * 职责：
 * - 把统一生命周期 AssetLifecycleStage 映射回 Experience/Rule/Skill 各自的本地枚举并回写。
 * - 每次晋升记录 AssetEvidenceLink（来源 Outcome/Experience + Walker 批准 + 理由），append-only。
 * - 提供"某资产由哪些 Outcome/Experience 支持"的反查（方案明确要求）。
 * - 证据不足时不注册 Skill，生成 LearningRequest（护栏：知识不等于产能）。
 *
 * 信任边界（方案 P2-B）：
 * - 晋升必须带至少一条 Outcome 或 Experience 来源，否则 missing-evidence。
 * - 注册 Skill（stage=validated/stable）前必须有支撑证据。
 * - 每次晋升保存 Walker 批准（approvedBy）与时间，保留审计。
 */

import { randomUUID } from 'node:crypto';

import { getRedis } from '@/conversation/store';
import {
  getSkillCandidateById,
  rollbackSkillAdmission,
  setSkillPaused,
  updateExperienceEvent,
  updateRuleStatus,
  updateSkillAdmission,
  updateSkillRegistration,
} from '@/conversation/store';
import { createAssetEvidenceLinkStore } from '@/stores/asset-evidence-link.store';
import { createLearningRequestStore } from '@/stores/learning-request.store';
import { resolveStorageMode } from '@/lib/storage-mode';
import type {
  AssetEvidenceLink,
  AssetKind,
  AssetLifecycleStage,
  ExperienceEvent,
  LearningRequest,
  RuleStatus,
  SkillAdmissionSnapshot,
  SkillAdmissionStatus,
  SkillCandidate,
} from '@/stores/ports';

import type {
  AssetResult,
  AssetServicePort,
  PromoteAssetInput,
} from './interfaces';

function nowIso(): string {
  return new Date().toISOString();
}

/** P4：构建一份准入快照（append-only，供 rollbackSkill 定位恢复点） */
function makeSnapshot(
  version: number,
  status: SkillAdmissionStatus,
  reason: string,
  over: Partial<SkillAdmissionSnapshot> = {},
): SkillAdmissionSnapshot {
  return { version, admissionStatus: status, capturedAt: nowIso(), reason, ...over };
}

/** P4：evalSet 是否覆盖 spec §28.3 要求的四类输入（normal/boundary/reject/failure） */
function evalSetCoversRequiredCategories(evalSet: { category: string }[]): boolean {
  const cats = new Set(evalSet.map(e => e.category));
  return cats.has('normal') && cats.has('boundary') && cats.has('reject') && cats.has('failure');
}

/** P4：统一阶段 → 注册层级（validated=limited 受控灰度，stable=stable 全量） */
function stageToRegistrationTier(stage: AssetLifecycleStage): 'limited' | 'stable' | undefined {
  if (stage === 'validated') return 'limited';
  if (stage === 'stable') return 'stable';
  return undefined;
}

/** 进程内单调序号：同毫秒内的多次晋升仍能保持顺序（append-only 审计要求）。 */
let assetSeq = 0;

function fail<T = void>(code: AssetResult['code'], message: string): AssetResult<T> {
  return { ok: false, code, message };
}
function ok<T>(data: T): AssetResult<T> {
  return { ok: true, code: 'ok', data };
}

/** 统一阶段 → 各资产本地枚举（回写本体状态时用） */
type ExperienceMaturity = NonNullable<ExperienceEvent['maturity']>;
function stageToExperienceMaturity(stage: AssetLifecycleStage): ExperienceMaturity {
  const map: Record<AssetLifecycleStage, ExperienceMaturity> = {
    observed: 'embryo',
    candidate: 'stable-method',
    validated: 'skill-candidate',
    stable: 'skill',
    retired: 'embryo',
  };
  return map[stage];
}

function stageToRuleStatus(stage: AssetLifecycleStage): RuleStatus {
  const map: Record<AssetLifecycleStage, RuleStatus> = {
    observed: 'observed',
    candidate: 'candidate',
    validated: 'validated',
    stable: 'stable',
    retired: 'retired',
  };
  return map[stage];
}

function stageToSkillAdmission(stage: AssetLifecycleStage): SkillAdmissionStatus {
  const map: Record<AssetLifecycleStage, SkillAdmissionStatus> = {
    observed: 'candidate',
    candidate: 'candidate',
    validated: 'admitted',
    stable: 'admitted',
    retired: 'demoted-to-method',
  };
  return map[stage];
}

export class AssetService implements AssetServicePort {
  constructor() {
    this.linkStore = createAssetEvidenceLinkStore();
    this.learningStore = createLearningRequestStore();
  }

  private readonly linkStore;
  private readonly learningStore;

  async promote(input: PromoteAssetInput): Promise<AssetResult<AssetEvidenceLink>> {
    if (!input.reason.trim()) {
      return fail('invalid-stage', '晋升必须填写理由。');
    }
    const hasOutcomeSource = (input.sourceOutcomeIds?.length ?? 0) > 0;
    const hasExperienceSource = (input.sourceExperienceIds?.length ?? 0) > 0;

    const isSkillRegistration = input.assetKind === 'skill'
      && (input.toStage === 'validated' || input.toStage === 'stable');

    // 注册 Skill（validated/stable）必须有支撑证据 —— 方案护栏
    if (isSkillRegistration) {
      if (!hasOutcomeSource && !hasExperienceSource) {
        return fail('missing-evidence', '注册 Skill 前必须有 Outcome 或 Experience 支撑证据；证据不足请改用 createLearningRequest。');
      }
      // P4 自动注册安全护栏（spec §12.7/§28）：注册到 registered-limited/stable 前，
      // 必须有适用边界、失败边界、≥1 反例、覆盖四类的可回放验证集。默认拒绝。
      const reg = input.skillRegistration;
      if (!reg) {
        return fail('missing-boundary', '注册 Skill 前必须提供 skillRegistration（适用边界 / 失败边界 / 反例 / 验证集）。');
      }
      if (!reg.applicableBoundary.trim() || !reg.failureBoundary.trim()) {
        return fail('missing-boundary', '注册 Skill 前必须明确适用边界与失败边界（问题域 / 非问题域）。');
      }
      if (!reg.negativeExamples || reg.negativeExamples.length === 0) {
        return fail('missing-counterexample', '注册 Skill 前必须提供至少一条反例（仅正例不足以界定边界）。');
      }
      if (!reg.evalSet || reg.evalSet.length === 0 || !evalSetCoversRequiredCategories(reg.evalSet)) {
        return fail('missing-eval-set', '注册 Skill 前必须提供覆盖 normal/boundary/reject/failure 四类的可回放验证集。');
      }
    }
    // 所有晋升都要求至少一条来源（observed→candidate 也算"被证据推动"）
    if (!hasOutcomeSource && !hasExperienceSource) {
      return fail('missing-evidence', '晋升必须引用至少一条 Outcome 或 Experience 作为来源。');
    }

    // 生产缺 Redis 拒绝（不静默丢晋升记录）
    const mode = resolveStorageMode({ hasRedis: Boolean(getRedis()) });
    if (mode === 'unavailable') {
      return fail('storage-unavailable', '存储不可用，晋升未记录。');
    }

    const timestamp = nowIso();
    assetSeq += 1;
    const link: AssetEvidenceLink = {
      linkId: `ael_${randomUUID()}`,
      assetKind: input.assetKind,
      assetId: input.assetId,
      stage: input.toStage,
      sourceOutcomeIds: input.sourceOutcomeIds ?? [],
      sourceExperienceIds: input.sourceExperienceIds ?? [],
      approvedBy: input.approvedBy,
      approvedAt: timestamp,
      reason: input.reason.trim(),
      workItemId: input.workItemId,
      seq: assetSeq,
    };

    // 回写资产本体的本地状态枚举
    if (input.assetKind === 'experience') {
      await updateExperienceEvent(input.assetId, { maturity: stageToExperienceMaturity(input.toStage) });
    } else if (input.assetKind === 'rule') {
      await updateRuleStatus(input.assetId, stageToRuleStatus(input.toStage), input.reason);
    } else if (isSkillRegistration) {
      // P4：注册 Skill 用 updateSkillRegistration 写入 boundary/反例/evalSet/层级 + 准入快照
      const existing = await getSkillCandidateById(input.assetId);
      const nextVersion = (existing?.admissionSnapshots?.length ?? 0) + 1;
      const targetStatus = stageToSkillAdmission(input.toStage);
      await updateSkillRegistration(input.assetId, {
        admissionStatus: targetStatus,
        registrationTier: stageToRegistrationTier(input.toStage),
        applicableBoundary: input.skillRegistration!.applicableBoundary.trim(),
        failureBoundary: input.skillRegistration!.failureBoundary.trim(),
        positiveExamples: input.skillRegistration!.positiveExamples ?? [],
        negativeExamples: input.skillRegistration!.negativeExamples,
        evalSet: input.skillRegistration!.evalSet,
        snapshot: makeSnapshot(nextVersion, targetStatus, input.reason, {
          registrationTier: stageToRegistrationTier(input.toStage),
        }),
      });
    } else {
      await updateSkillAdmission(input.assetId, stageToSkillAdmission(input.toStage));
    }

    await this.linkStore.save(link);
    return ok(link);
  }

  async pauseSkill(skillId: string, reason: string): Promise<AssetResult<void>> {
    if (!reason.trim()) return fail('invalid-input', '暂停必须填写理由。');
    const existing = await getSkillCandidateById(skillId);
    if (!existing) return fail('not-found', 'Skill 不存在。');
    const nextVersion = (existing.admissionSnapshots?.length ?? 0) + 1;
    await setSkillPaused(skillId, true, reason.trim(), makeSnapshot(nextVersion, existing.admissionStatus, `暂停：${reason}`));
    return ok(undefined);
  }

  async resumeSkill(skillId: string, reason: string): Promise<AssetResult<void>> {
    if (!reason.trim()) return fail('invalid-input', '恢复必须填写理由。');
    const existing = await getSkillCandidateById(skillId);
    if (!existing) return fail('not-found', 'Skill 不存在。');
    const nextVersion = (existing.admissionSnapshots?.length ?? 0) + 1;
    await setSkillPaused(skillId, false, reason.trim(), makeSnapshot(nextVersion, existing.admissionStatus, `恢复：${reason}`));
    return ok(undefined);
  }

  async rollbackSkill(skillId: string, toVersion: number, reason: string): Promise<AssetResult<void>> {
    if (!reason.trim()) return fail('invalid-input', '回滚必须填写理由。');
    const existing = await getSkillCandidateById(skillId);
    if (!existing) return fail('not-found', 'Skill 不存在。');
    const snapshot = (existing.admissionSnapshots ?? []).find(s => s.version === toVersion);
    if (!snapshot) {
      return fail('not-found', `找不到版本 ${toVersion} 的准入快照，无法回滚。`);
    }
    await rollbackSkillAdmission(skillId, { ...snapshot, reason: `回滚到 v${toVersion}：${reason}` });
    return ok(undefined);
  }

  async getSupportingEvidence(kind: AssetKind, assetId: string): Promise<AssetEvidenceLink[]> {
    return this.linkStore.findByAsset(kind, assetId);
  }

  async recentPromotions(limit?: number): Promise<AssetEvidenceLink[]> {
    return this.linkStore.findRecent(limit);
  }

  async createLearningRequest(input: {
    evidenceGap: LearningRequest['evidenceGap'];
    context: string;
    expectedEvidence: string;
    topicId?: string;
    assetKind?: AssetKind;
    assetId?: string;
    workItemId?: string;
  }): Promise<LearningRequest> {
    if (!input.context.trim() || !input.expectedEvidence.trim()) {
      throw new Error('学习请求必须包含 context 与 expectedEvidence。');
    }
    const timestamp = nowIso();
    const request: LearningRequest = {
      requestId: `lr_${randomUUID()}`,
      createdAt: timestamp,
      updatedAt: timestamp,
      evidenceGap: input.evidenceGap,
      context: input.context.trim(),
      expectedEvidence: input.expectedEvidence.trim(),
      status: 'open',
      topicId: input.topicId,
      assetKind: input.assetKind,
      assetId: input.assetId,
      workItemId: input.workItemId,
    };
    await this.learningStore.save(request);
    return request;
  }

  async listLearningRequests(status?: LearningRequest['status']): Promise<LearningRequest[]> {
    if (status) return this.learningStore.findByStatus(status);
    return this.learningStore.findRecent();
  }

  async fulfillLearningRequest(requestId: string, fulfillmentNote: string): Promise<AssetResult<LearningRequest>> {
    if (!fulfillmentNote.trim()) {
      return fail('invalid-stage', '完成学习请求必须填写结果摘要。');
    }
    const existing = await this.learningStore.findById(requestId);
    if (!existing) return fail('not-found', '学习请求不存在。');
    const timestamp = nowIso();
    const updated: LearningRequest = {
      ...existing,
      status: 'fulfilled',
      fulfillmentNote: fulfillmentNote.trim(),
      fulfilledAt: timestamp,
      updatedAt: timestamp,
    };
    await this.learningStore.save(updated);
    return ok(updated);
  }
}

export function createAssetService(): AssetServicePort {
  return new AssetService();
}
