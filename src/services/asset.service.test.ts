import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __resetMemoryAssetLinks,
  __resetMemoryLearningRequests,
  __resetMemorySkillCandidates,
  __resetMemoryWorkItems,
  getSkillCandidateById,
  saveSkillCandidate,
} from '@/conversation/store';
import { createAssetService } from './asset.service';
import { validateSkillRegistration } from './asset.service';
import type { SkillCandidate } from '@/stores/ports';

/** P4：构造一份满足注册护栏的 skillRegistration（边界 + 反例 + 四类 evalSet） */
function validSkillReg() {
  return {
    applicableBoundary: '用于把自然语言需求转成站内资源推荐',
    failureBoundary: '不处理账号、支付、私密对话',
    negativeExamples: ['要求删除账号', '索要他人隐私'],
    evalSet: [
      { input: '我想学 AI', expectedOutput: '推荐入门指南', category: 'normal' as const },
      { input: '已有 3 年经验', expectedOutput: '推荐专家轨', category: 'boundary' as const },
      { input: '帮我删账号', expectedOutput: '拒绝并指引 /account', category: 'reject' as const },
      { input: '乱码输入', expectedOutput: '请求澄清', category: 'failure' as const },
    ],
  };
}

function seedSkill(skillId: string, over: Partial<SkillCandidate> = {}): SkillCandidate {
  const now = '2026-06-21T00:00:00.000Z';
  const skill: SkillCandidate = {
    skillId,
    createdAt: now,
    updatedAt: now,
    name: `测试 Skill ${skillId}`,
    description: '注册护栏测试',
    admissionStatus: 'candidate',
    domain: 'recommendation',
    inputConditions: '自然语言需求',
    outputForm: '资源推荐',
    validationCriteria: '回放通过',
    sourceExperienceIds: [],
    version: 1,
    ...over,
  };
  void saveSkillCandidate(skill);
  return skill;
}

describe('AssetService 资产晋升链路（P2-B）', () => {
  beforeEach(() => {
    __resetMemoryAssetLinks();
    __resetMemoryLearningRequests();
    __resetMemorySkillCandidates();
    __resetMemoryWorkItems();
  });
  afterEach(() => {
    __resetMemoryAssetLinks();
    __resetMemoryLearningRequests();
    __resetMemorySkillCandidates();
    __resetMemoryWorkItems();
  });

  it('晋升资产必须带至少一条来源（Outcome 或 Experience），否则 missing-evidence', async () => {
    const svc = createAssetService();
    const result = await svc.promote({
      assetKind: 'rule',
      assetId: 'rule-1',
      toStage: 'validated',
      approvedBy: 'walker',
      reason: '多次回放命中',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('missing-evidence');
  });

  it('注册 Skill（validated/stable）必须有支撑证据', async () => {
    const svc = createAssetService();
    // 无证据注册 Skill → 拒绝
    const blocked = await svc.promote({
      assetKind: 'skill',
      assetId: 'skill-1',
      toStage: 'validated',
      approvedBy: 'walker',
      reason: '想注册',
    });
    expect(blocked.code).toBe('missing-evidence');
    expect(blocked.message).toContain('Skill');

    // 带 Outcome 证据 + 完整注册护栏注册 Skill → 通过
    const ok = await svc.promote({
      assetKind: 'skill',
      assetId: 'skill-1',
      toStage: 'validated',
      sourceOutcomeIds: ['outcome-1'],
      approvedBy: 'walker',
      reason: '有 Outcome 支撑，准入',
      skillRegistration: validSkillReg(),
    });
    expect(ok.ok).toBe(true);
    expect(ok.data!.stage).toBe('validated');
    expect(ok.data!.sourceOutcomeIds).toEqual(['outcome-1']);
    expect(ok.data!.approvedBy).toBe('walker');
  });

  it('晋升 Rule 记录证据链，且可反查支撑来源', async () => {
    const svc = createAssetService();
    await svc.promote({
      assetKind: 'rule',
      assetId: 'rule-A',
      toStage: 'validated',
      sourceOutcomeIds: ['outcome-A1', 'outcome-A2'],
      sourceExperienceIds: ['exp-A1'],
      approvedBy: 'walker',
      reason: '两条 Outcome + 一条经验支撑',
    });
    const evidence = await svc.getSupportingEvidence('rule', 'rule-A');
    expect(evidence).toHaveLength(1);
    expect(evidence[0].sourceOutcomeIds).toEqual(['outcome-A1', 'outcome-A2']);
    expect(evidence[0].sourceExperienceIds).toEqual(['exp-A1']);
  });

  it('多次晋升 append-only，按时间倒序，保留 Walker 批准与理由', async () => {
    const svc = createAssetService();
    await svc.promote({
      assetKind: 'experience', assetId: 'exp-1', toStage: 'candidate',
      sourceOutcomeIds: ['o1'], approvedBy: 'walker', reason: '第一次晋升',
    });
    await svc.promote({
      assetKind: 'experience', assetId: 'exp-1', toStage: 'validated',
      sourceOutcomeIds: ['o2'], approvedBy: 'walker', reason: '第二次晋升',
    });
    const evidence = await svc.getSupportingEvidence('experience', 'exp-1');
    expect(evidence).toHaveLength(2);
    expect(evidence[0].stage).toBe('validated'); // 倒序，最新在前
    expect(evidence[1].stage).toBe('candidate');
    expect(evidence.every(e => e.approvedBy === 'walker')).toBe(true);
  });

  it('recentPromotions 返回跨资产的晋升活动流', async () => {
    const svc = createAssetService();
    await svc.promote({
      assetKind: 'rule', assetId: 'r1', toStage: 'candidate',
      sourceOutcomeIds: ['o1'], approvedBy: 'walker', reason: 'r1',
    });
    await svc.promote({
      assetKind: 'skill', assetId: 's1', toStage: 'validated',
      sourceOutcomeIds: ['o2'], approvedBy: 'walker', reason: 's1',
      skillRegistration: validSkillReg(),
    });
    const recent = await svc.recentPromotions();
    expect(recent.length).toBeGreaterThanOrEqual(2);
    expect(recent.some(l => l.assetKind === 'rule')).toBe(true);
    expect(recent.some(l => l.assetKind === 'skill')).toBe(true);
  });

  it('证据不足生成 LearningRequest，不注册 Skill', async () => {
    const svc = createAssetService();
    const request = await svc.createLearningRequest({
      evidenceGap: 'counter-example',
      context: '该 Skill 缺少反例验证',
      expectedEvidence: '至少 2 个失败边界案例',
      assetKind: 'skill',
      assetId: 'skill-weak',
    });
    expect(request.status).toBe('open');
    expect(request.evidenceGap).toBe('counter-example');

    const list = await svc.listLearningRequests('open');
    expect(list.some(r => r.requestId === request.requestId)).toBe(true);
  });

  it('完成学习请求需填结果摘要，fulfilled 后状态更新', async () => {
    const svc = createAssetService();
    const request = await svc.createLearningRequest({
      evidenceGap: 'practice',
      context: '缺实践',
      expectedEvidence: '一次真实执行',
    });
    const noNote = await svc.fulfillLearningRequest(request.requestId, '');
    expect(noNote.code).toBe('invalid-stage');

    const fulfilled = await svc.fulfillLearningRequest(request.requestId, '已执行一次，结果成功');
    expect(fulfilled.ok).toBe(true);
    expect(fulfilled.data!.status).toBe('fulfilled');
    expect(fulfilled.data!.fulfillmentNote).toBe('已执行一次，结果成功');
    expect(fulfilled.data!.fulfilledAt).toBeTruthy();
  });

  it('完成不存在的学习请求返回 not-found', async () => {
    const svc = createAssetService();
    const result = await svc.fulfillLearningRequest('lr_missing', 'x');
    expect(result.code).toBe('not-found');
  });
});

describe('AssetService P4 Skill 注册护栏（默认拒绝）', () => {
  beforeEach(() => {
    __resetMemoryAssetLinks();
    __resetMemorySkillCandidates();
    __resetMemoryWorkItems();
  });

  it('注册 Skill 缺 skillRegistration → missing-boundary', async () => {
    const svc = createAssetService();
    const result = await svc.promote({
      assetKind: 'skill', assetId: 'sk', toStage: 'validated',
      sourceOutcomeIds: ['o1'], approvedBy: 'walker', reason: 'r',
    });
    expect(result.code).toBe('missing-boundary');
  });

  it('注册 Skill 缺反例 → missing-counterexample', async () => {
    const svc = createAssetService();
    const result = await svc.promote({
      assetKind: 'skill', assetId: 'sk', toStage: 'validated',
      sourceOutcomeIds: ['o1'], approvedBy: 'walker', reason: 'r',
      skillRegistration: {
        applicableBoundary: 'b', failureBoundary: 'f',
        negativeExamples: [], evalSet: validSkillReg().evalSet,
      },
    });
    expect(result.code).toBe('missing-counterexample');
  });

  it('注册 Skill evalSet 缺类别 → missing-eval-set', async () => {
    const svc = createAssetService();
    const result = await svc.promote({
      assetKind: 'skill', assetId: 'sk', toStage: 'validated',
      sourceOutcomeIds: ['o1'], approvedBy: 'walker', reason: 'r',
      skillRegistration: {
        applicableBoundary: 'b', failureBoundary: 'f',
        negativeExamples: ['反例1'],
        evalSet: [
          { input: 'a', expectedOutput: 'b', category: 'normal' },
          { input: 'c', expectedOutput: 'd', category: 'boundary' },
          // 缺 reject / failure
        ],
      },
    });
    expect(result.code).toBe('missing-eval-set');
  });

  it('注册 Skill 完整护栏 → 写入边界/反例/evalSet + 层级 + 快照', async () => {
    seedSkill('sk-full');
    const svc = createAssetService();
    const result = await svc.promote({
      assetKind: 'skill', assetId: 'sk-full', toStage: 'validated',
      sourceOutcomeIds: ['o1'], approvedBy: 'walker', reason: '完整注册',
      skillRegistration: validSkillReg(),
    });
    expect(result.ok).toBe(true);
    const skill = await getSkillCandidateById('sk-full');
    expect(skill?.admissionStatus).toBe('admitted');
    expect(skill?.registrationTier).toBe('limited'); // validated → limited
    expect(skill?.applicableBoundary).toBeTruthy();
    expect(skill?.negativeExamples?.length).toBeGreaterThan(0);
    expect(skill?.evalSet?.length).toBe(4);
    expect(skill?.admissionSnapshots).toHaveLength(1);
    expect(skill?.admissionSnapshots?.[0].registrationTier).toBe('limited');
  });

  it('stable 阶段 → registrationTier=stable', async () => {
    seedSkill('sk-stable');
    const svc = createAssetService();
    await svc.promote({
      assetKind: 'skill', assetId: 'sk-stable', toStage: 'stable',
      sourceOutcomeIds: ['o1'], approvedBy: 'walker', reason: '全量',
      skillRegistration: validSkillReg(),
    });
    const skill = await getSkillCandidateById('sk-stable');
    expect(skill?.registrationTier).toBe('stable');
  });
});

describe('AssetService P4 Skill 暂停 / 恢复 / 回滚', () => {
  beforeEach(() => {
    __resetMemoryAssetLinks();
    __resetMemorySkillCandidates();
    __resetMemoryWorkItems();
  });

  it('pauseSkill 置 paused 标志 + 写快照；resumeSkill 恢复', async () => {
    seedSkill('sk-p');
    const svc = createAssetService();
    await svc.promote({
      assetKind: 'skill', assetId: 'sk-p', toStage: 'validated',
      sourceOutcomeIds: ['o1'], approvedBy: 'walker', reason: '注册',
      skillRegistration: validSkillReg(),
    });

    const paused = await svc.pauseSkill('sk-p', '回放命中率下降');
    expect(paused.ok).toBe(true);
    let skill = await getSkillCandidateById('sk-p');
    expect(skill?.paused).toBe(true);
    expect(skill?.pausedReason).toContain('回放命中率下降');
    expect(skill?.admissionSnapshots).toHaveLength(2); // 注册 + 暂停

    const resumed = await svc.resumeSkill('sk-p', '修复后恢复');
    expect(resumed.ok).toBe(true);
    skill = await getSkillCandidateById('sk-p');
    expect(skill?.paused).toBe(false);
    expect(skill?.pausedReason).toBeUndefined();
  });

  it('pauseSkill 缺理由 / 不存在 → 拒绝', async () => {
    const svc = createAssetService();
    expect((await svc.pauseSkill('sk-x', '')).code).toBe('invalid-input');
    expect((await svc.pauseSkill('sk-missing', 'r')).code).toBe('not-found');
  });

  it('rollbackSkill 回滚到注册版本，admission 恢复', async () => {
    seedSkill('sk-rb');
    const svc = createAssetService();
    await svc.promote({
      assetKind: 'skill', assetId: 'sk-rb', toStage: 'validated',
      sourceOutcomeIds: ['o1'], approvedBy: 'walker', reason: 'v1 注册',
      skillRegistration: validSkillReg(),
    });
    // 再暂停产生 v2 快照
    await svc.pauseSkill('sk-rb', '问题');

    // 回滚到 v1（注册时的快照）
    const rb = await svc.rollbackSkill('sk-rb', 1, '回滚到首版注册');
    expect(rb.ok).toBe(true);
    const skill = await getSkillCandidateById('sk-rb');
    expect(skill?.paused).toBe(false); // v1 快照 paused 未定义 → 回滚后 false
    expect(skill?.admissionStatus).toBe('admitted');
    expect(skill?.admissionSnapshots?.length).toBeGreaterThanOrEqual(3); // v1 + v2 + 回滚快照
  });

  it('rollbackSkill 到不存在版本 → not-found', async () => {
    seedSkill('sk-rb2');
    const svc = createAssetService();
    await svc.promote({
      assetKind: 'skill', assetId: 'sk-rb2', toStage: 'validated',
      sourceOutcomeIds: ['o1'], approvedBy: 'walker', reason: 'r',
      skillRegistration: validSkillReg(),
    });
    const rb = await svc.rollbackSkill('sk-rb2', 99, '不存在');
    expect(rb.code).toBe('not-found');
  });
});

describe('validateSkillRegistration 共享守护（防 skills 页旁路）', () => {
  // 此校验器被 asset.service.promote 与 /api/admin/skills?action=admission 共用，
  // 确保 Skill 注册的两条路径都不被旁路。测试覆盖各种缺失。
  it('undefined / 缺边界 → missing-boundary', () => {
    expect(validateSkillRegistration(undefined)).toBe('missing-boundary');
    expect(validateSkillRegistration({ applicableBoundary: '', failureBoundary: '' })).toBe('missing-boundary');
    expect(validateSkillRegistration({ applicableBoundary: 'b', failureBoundary: '' })).toBe('missing-boundary');
  });

  it('有边界但无反例 → missing-counterexample', () => {
    expect(validateSkillRegistration({
      applicableBoundary: 'b', failureBoundary: 'f',
      negativeExamples: [], evalSet: validSkillReg().evalSet,
    })).toBe('missing-counterexample');
  });

  it('evalSet 缺类别 → missing-eval-set', () => {
    expect(validateSkillRegistration({
      applicableBoundary: 'b', failureBoundary: 'f',
      negativeExamples: ['反例'],
      evalSet: [{ category: 'normal' }], // 只一类，缺 boundary/reject/failure
    })).toBe('missing-eval-set');
  });

  it('完整（四类 evalSet + 反例 + 边界）→ null（通过）', () => {
    expect(validateSkillRegistration(validSkillReg())).toBeNull();
  });
});
