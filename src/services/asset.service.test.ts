import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __resetMemoryAssetLinks,
  __resetMemoryLearningRequests,
  __resetMemoryWorkItems,
} from '@/conversation/store';
import { createAssetService } from './asset.service';

describe('AssetService 资产晋升链路（P2-B）', () => {
  beforeEach(() => {
    __resetMemoryAssetLinks();
    __resetMemoryLearningRequests();
    __resetMemoryWorkItems();
  });
  afterEach(() => {
    __resetMemoryAssetLinks();
    __resetMemoryLearningRequests();
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

    // 带 Outcome 证据注册 Skill → 通过
    const ok = await svc.promote({
      assetKind: 'skill',
      assetId: 'skill-1',
      toStage: 'validated',
      sourceOutcomeIds: ['outcome-1'],
      approvedBy: 'walker',
      reason: '有 Outcome 支撑，准入',
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
