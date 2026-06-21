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
  updateExperienceEvent,
  updateRuleStatus,
  updateSkillAdmission,
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
  SkillAdmissionStatus,
} from '@/stores/ports';

import type {
  AssetResult,
  AssetServicePort,
  PromoteAssetInput,
} from './interfaces';

function nowIso(): string {
  return new Date().toISOString();
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

    // 注册 Skill（validated/stable）必须有支撑证据 —— 方案护栏
    if (input.assetKind === 'skill' && (input.toStage === 'validated' || input.toStage === 'stable')) {
      if (!hasOutcomeSource && !hasExperienceSource) {
        return fail('missing-evidence', '注册 Skill 前必须有 Outcome 或 Experience 支撑证据；证据不足请改用 createLearningRequest。');
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
    } else {
      await updateSkillAdmission(input.assetId, stageToSkillAdmission(input.toStage));
    }

    await this.linkStore.save(link);
    return ok(link);
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
