import { describe, expect, it } from 'vitest';
import type { DeploymentView } from '@walker/shared';
import { HOME_XIAOYING_PLACEMENT, PUBLIC_SITE_SCOPE } from '@walker/shared';
import { buildSaveBody, emptyForm, formFromDeployment, saveProblem } from './DeploymentsPage';

const deployment: DeploymentView = {
  id: 'dep-1',
  placementKey: 'post-detail',
  scopeKind: 'post',
  scopeSlug: 'a-post',
  generation: 3,
  enabled: true,
  updatedAt: '2026-09-22T00:00:00.000Z',
  members: [
    { id: 'm1', agentRevisionId: 'rev-1', agentId: 'agent-a', revision: 1, isDefault: true },
    { id: 'm2', agentRevisionId: 'rev-2', agentId: 'agent-a', revision: 2, isDefault: false },
  ],
};

describe('位置绑定表单', () => {
  it('新建请求体：generation 为 null、带幂等 deploymentId、slug 去空白', () => {
    const form = emptyForm();
    form.scopeSlug = '  a-post ';
    form.members = [
      { key: 'k1', agentId: 'agent-a', agentRevisionId: 'rev-1', isDefault: true },
      { key: 'k2', agentId: 'agent-a', agentRevisionId: 'rev-2', isDefault: false },
    ];
    const body = buildSaveBody(form, null);
    expect(body.expectedGeneration).toBeNull();
    expect(body.deploymentId).toBe(form.deploymentId);
    expect(body.scopeSlug).toBe('a-post');
    expect(body.members).toHaveLength(2);
  });

  it('编辑请求体：只带当前 generation CAS，不带旧 deploymentId', () => {
    const form = formFromDeployment(deployment, 'dep-new-key');
    const body = buildSaveBody(form, deployment);
    expect(body.expectedGeneration).toBe(3);
    expect('deploymentId' in body).toBe(false);
    expect(body.members.map((member) => member.agentRevisionId)).toEqual(['rev-1', 'rev-2']);
  });

  it('表单校验：空 slug、未选版本、默认成员数量不符都给出原因', () => {
    const form = emptyForm();
    expect(saveProblem(form)).toBe('请填写对象（文章 slug）');
    form.scopeSlug = 'a-post';
    expect(saveProblem(form)).toBe('每个成员都要选定 Agent 与版本');
    form.members = [
      { key: 'k1', agentId: 'a', agentRevisionId: 'rev-1', isDefault: true },
      { key: 'k2', agentId: 'a', agentRevisionId: 'rev-2', isDefault: true },
    ];
    expect(saveProblem(form)).toBe('必须恰有一个默认成员');
    form.members[1]!.isDefault = false;
    expect(saveProblem(form)).toBeNull();
  });

  it('位置只能是服务端登记的清单项（首期文章详情）', () => {
    const form = emptyForm();
    form.placementKey = 'any-script';
    form.scopeSlug = 'a-post';
    form.members = [{ key: 'k1', agentId: 'a', agentRevisionId: 'rev-1', isDefault: true }];
    expect(saveProblem(form)).toBe('位置未在服务端登记');
  });

  it('首页小影只绑定固定全站公开范围', () => {
    const form = emptyForm();
    form.placementKey = HOME_XIAOYING_PLACEMENT;
    form.scopeSlug = 'post-a';
    form.members = [{ key: 'k1', agentId: 'a', agentRevisionId: 'rev-1', isDefault: true }];
    expect(saveProblem(form)).toBe('首页小影只能使用全站公开范围');
    form.scopeSlug = PUBLIC_SITE_SCOPE;
    expect(saveProblem(form)).toBeNull();
  });
});
