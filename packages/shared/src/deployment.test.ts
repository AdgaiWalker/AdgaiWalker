import { describe, expect, it } from 'vitest';
import { findPlacement, parseDeploymentSave, parseGeneration, REGISTERED_PLACEMENTS, HOME_XIAOYING_PLACEMENT, PUBLIC_SITE_SCOPE, placementContentAvailable } from './deployment.js';

describe('位置注册表', () => {
  it('文章与首页小影是仅有的公开部署位置；未登记位置返回 null', () => {
    expect(REGISTERED_PLACEMENTS.map((p) => p.key)).toEqual(['post-detail', HOME_XIAOYING_PLACEMENT]);
    expect(findPlacement('post-detail')?.scopeKind).toBe('post');
    expect(findPlacement(HOME_XIAOYING_PLACEMENT)?.scopeKind).toBe('site');
    expect(findPlacement('any-script')).toBeNull();
  });

  it('首页只可用非空公开快照，文章位置仍只认对应 slug', () => {
    expect(placementContentAvailable(HOME_XIAOYING_PLACEMENT, PUBLIC_SITE_SCOPE, ['post-a'])).toBe(true);
    expect(placementContentAvailable(HOME_XIAOYING_PLACEMENT, PUBLIC_SITE_SCOPE, [])).toBe(false);
    expect(placementContentAvailable(HOME_XIAOYING_PLACEMENT, 'post-a', ['post-a'])).toBe(false);
    expect(placementContentAvailable('post-detail', 'post-a', ['post-a'])).toBe(true);
    expect(placementContentAvailable('post-detail', 'post-b', ['post-a'])).toBe(false);
  });
});

describe('parseDeploymentSave', () => {
  const valid = {
    placementKey: 'post-detail',
    scopeSlug: 'a-post',
    members: [
      { agentRevisionId: 'rev-1', isDefault: true },
      { agentRevisionId: 'rev-2', isDefault: false },
    ],
    expectedGeneration: null,
  };

  it('合法请求通过；deploymentId 缺省为 null', () => {
    const parsed = parseDeploymentSave(valid);
    expect(parsed?.placementKey).toBe('post-detail');
    expect(parsed?.members).toHaveLength(2);
    expect(parsed?.deploymentId).toBeNull();
  });

  it('首页小影只接受固定公开站范围，访客不能创造任意站点范围', () => {
    expect(parseDeploymentSave({ ...valid, placementKey: HOME_XIAOYING_PLACEMENT, scopeSlug: PUBLIC_SITE_SCOPE })?.scopeSlug).toBe(PUBLIC_SITE_SCOPE);
    expect(parseDeploymentSave({ ...valid, placementKey: HOME_XIAOYING_PLACEMENT, scopeSlug: 'another-site' })).toBeNull();
  });

  it('未知字段、未登记位置、空 slug、空成员、坏成员都拒绝', () => {
    expect(parseDeploymentSave({ ...valid, hack: true })).toBeNull();
    expect(parseDeploymentSave({ ...valid, placementKey: 'any-script' })).toBeNull();
    expect(parseDeploymentSave({ ...valid, scopeSlug: '  ' })).toBeNull();
    expect(parseDeploymentSave({ ...valid, members: [] })).toBeNull();
    expect(parseDeploymentSave({ ...valid, members: [{ agentRevisionId: '', isDefault: true }] })).toBeNull();
    expect(parseDeploymentSave({ ...valid, members: [{ agentRevisionId: 'r' }] })).toBeNull();
    expect(parseDeploymentSave('x')).toBeNull();
    expect(parseDeploymentSave(null)).toBeNull();
  });

  it('expectedGeneration 只接受正整数或 null', () => {
    expect(parseDeploymentSave({ ...valid, expectedGeneration: 3 })?.expectedGeneration).toBe(3);
    expect(parseDeploymentSave({ ...valid, expectedGeneration: 0 })).toBeNull();
    expect(parseDeploymentSave({ ...valid, expectedGeneration: 1.5 })).toBeNull();
    expect(parseDeploymentSave({ ...valid, expectedGeneration: '1' })).toBeNull();
  });
});

describe('parseGeneration', () => {
  it('只接受整数 expectedGeneration', () => {
    expect(parseGeneration({ expectedGeneration: 2 })).toBe(2);
    expect(parseGeneration({})).toBeNull();
    expect(parseGeneration({ expectedGeneration: '2' })).toBeNull();
    expect(parseGeneration(null)).toBeNull();
  });
});
