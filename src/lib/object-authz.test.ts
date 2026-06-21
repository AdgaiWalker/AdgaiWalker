import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetMemoryObjectGrants, saveObjectGrant, findObjectGrantsByGrantee } from '@/conversation/store';
import { canPerformObjectAction, type ActorIdentity } from './object-authz';

function makeGrant(over: Partial<import('@/stores/ports').ObjectGrant> = {}): import('@/stores/ports').ObjectGrant {
  return {
    grantId: over.grantId ?? `og_${Math.random().toString(36).slice(2, 8)}`,
    grantee: over.grantee ?? 'contributor-1',
    resourceType: over.resourceType ?? 'content',
    resourceId: over.resourceId ?? 'some-slug',
    actions: over.actions ?? ['read'],
    grantedBy: over.grantedBy ?? 'owner',
    grantedAt: over.grantedAt ?? '2026-06-21T00:00:00.000Z',
    expiresAt: over.expiresAt,
    reason: over.reason ?? '协作授权',
  };
}

const owner: ActorIdentity = { username: 'walker', role: 'owner' };
const admin: ActorIdentity = { username: 'admin1', role: 'admin' };
const anon: ActorIdentity = { username: null, role: 'anonymous' };
const contributor = (name = 'contributor-1'): ActorIdentity => ({ username: name, role: 'user' });

describe('object-authz P4 Contributor 对象级授权（默认拒绝）', () => {
  beforeEach(() => __resetMemoryObjectGrants());
  afterEach(() => __resetMemoryObjectGrants());

  it('owner 与 admin 全通过；anonymous 与无 grant 的 user 默认拒绝', async () => {
    expect(await canPerformObjectAction(owner, 'content', 'x', 'read')).toBe(true);
    expect(await canPerformObjectAction(admin, 'content', 'x', 'read')).toBe(true);
    expect(await canPerformObjectAction(anon, 'content', 'x', 'read')).toBe(false);
    expect(await canPerformObjectAction(contributor(), 'content', 'x', 'read')).toBe(false);
  });

  it('user 命中精确 grant（type+id+action）→ 放行', async () => {
    await saveObjectGrant(makeGrant({ grantee: 'c1', resourceType: 'content', resourceId: 'slug-a', actions: ['read', 'comment'] }));
    expect(await canPerformObjectAction(contributor('c1'), 'content', 'slug-a', 'read')).toBe(true);
    expect(await canPerformObjectAction(contributor('c1'), 'content', 'slug-a', 'comment')).toBe(true);
  });

  it('grant 的 resourceId 不匹配 / action 不在允许列表 → 拒绝', async () => {
    await saveObjectGrant(makeGrant({ grantee: 'c2', resourceType: 'content', resourceId: 'slug-a', actions: ['read'] }));
    expect(await canPerformObjectAction(contributor('c2'), 'content', 'slug-b', 'read')).toBe(false); // 不同 id
    expect(await canPerformObjectAction(contributor('c2'), 'content', 'slug-a', 'delete')).toBe(false); // 不同 action
    expect(await canPerformObjectAction(contributor('c2'), 'workitem', 'slug-a', 'read')).toBe(false); // 不同 type
  });

  it('resourceId="*" 通配该类型所有资源', async () => {
    await saveObjectGrant(makeGrant({ grantee: 'c3', resourceType: 'content', resourceId: '*', actions: ['read'] }));
    expect(await canPerformObjectAction(contributor('c3'), 'content', 'any-slug', 'read')).toBe(true);
    expect(await canPerformObjectAction(contributor('c3'), 'content', 'another', 'read')).toBe(true);
  });

  it('过期 grant 视同不存在', async () => {
    await saveObjectGrant(makeGrant({
      grantee: 'c4', resourceType: 'content', resourceId: 'slug-x', actions: ['read'],
      expiresAt: '2020-01-01T00:00:00.000Z', // 过去
    }));
    expect(await canPerformObjectAction(contributor('c4'), 'content', 'slug-x', 'read')).toBe(false);
  });

  it('未过期 grant 放行；TTL 边界正确', async () => {
    await saveObjectGrant(makeGrant({
      grantee: 'c5', resourceType: 'content', resourceId: 'slug-y', actions: ['read'],
      expiresAt: '2099-01-01T00:00:00.000Z', // 未来
    }));
    expect(await canPerformObjectAction(contributor('c5'), 'content', 'slug-y', 'read')).toBe(true);
  });

  it('grant 按被授权人隔离（A 的 grant 不影响 B）', async () => {
    await saveObjectGrant(makeGrant({ grantee: 'alice', resourceType: 'content', resourceId: 's', actions: ['read'] }));
    expect(await canPerformObjectAction(contributor('alice'), 'content', 's', 'read')).toBe(true);
    expect(await canPerformObjectAction(contributor('bob'), 'content', 's', 'read')).toBe(false);
  });

  it('findObjectGrantsByGrantee 按 resourceType 过滤', async () => {
    await saveObjectGrant(makeGrant({ grantee: 'c6', resourceType: 'content', resourceId: 's1' }));
    await saveObjectGrant(makeGrant({ grantee: 'c6', resourceType: 'workitem', resourceId: 'w1' }));
    const all = await findObjectGrantsByGrantee('c6');
    expect(all).toHaveLength(2);
    const onlyContent = await findObjectGrantsByGrantee('c6', 'content');
    expect(onlyContent).toHaveLength(1);
    expect(onlyContent[0].resourceType).toBe('content');
  });
});
