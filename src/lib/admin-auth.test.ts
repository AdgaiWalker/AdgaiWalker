import { describe, expect, it, beforeEach } from 'vitest';

import type { SessionRepositoryPort, UserSession } from '@/stores/ports';
import { signSessionToken } from './account-auth';
import { isAdmin, isOwner, isAdminAsync, isOwnerAsync } from './admin-auth';

import.meta.env.COOKIE_SECRET = 'admin-auth-test-secret';

function makeRequest(role: 'user' | 'admin' | 'owner' | null, sid = 'sid-1'): Request {
  if (role === null) return new Request('http://localhost/api/admin/test');
  const token = signSessionToken({ sid, role, iat: Math.floor(Date.now() / 1000) });
  return new Request('http://localhost/api/admin/test', {
    headers: { cookie: `walker-session=${token}` },
  });
}

function makeSessionStore(opts: { valid: boolean }): SessionRepositoryPort {
  const session: UserSession | null = opts.valid
    ? { sessionId: 'sid-1', username: 'walker', role: 'owner', createdAt: '', expiresAt: '2099-01-01T00:00:00.000Z' }
    : null;
  return {
    async create() {},
    async get() { return session; },
    async isValid() { return opts.valid; },
    async revoke() {},
    async killAllByUsername() {},
    async listByUsername() { return []; },
  };
}

function makeTamperedRequest(role: 'admin' | 'owner'): Request {
  const token = signSessionToken({ sid: 'sid-1', role, iat: Math.floor(Date.now() / 1000) });
  return new Request('http://localhost/api/admin/test', {
    headers: { cookie: `walker-session=${token.slice(0, -4)}xxxx` },
  });
}

describe('admin-auth 同步判定（cookie-only）', () => {
  it('admin / owner 有后台权限；user 无', () => {
    expect(isAdmin(makeRequest('admin'))).toBe(true);
    expect(isAdmin(makeRequest('owner'))).toBe(true);
    expect(isAdmin(makeRequest('user'))).toBe(false);
    expect(isAdmin(makeRequest(null))).toBe(false);
  });

  it('只有 owner 通过 isOwner', () => {
    expect(isOwner(makeRequest('owner'))).toBe(true);
    expect(isOwner(makeRequest('admin'))).toBe(false);
  });
});

describe('isAdminAsync 信任链', () => {
  let validStore = makeSessionStore({ valid: true });
  let invalidStore = makeSessionStore({ valid: false });

  beforeEach(() => {
    validStore = makeSessionStore({ valid: true });
    invalidStore = makeSessionStore({ valid: false });
  });

  it('有效 session + 正确 role → true', async () => {
    expect(await isAdminAsync(makeRequest('admin'), validStore)).toBe(true);
    expect(await isAdminAsync(makeRequest('owner'), validStore)).toBe(true);
  });

  it('正确 role 但 session 已被 killAllByUsername → false', async () => {
    expect(await isAdminAsync(makeRequest('admin'), invalidStore)).toBe(false);
    expect(await isAdminAsync(makeRequest('owner'), invalidStore)).toBe(false);
  });

  it('无 cookie → false', async () => {
    expect(await isAdminAsync(makeRequest(null), validStore)).toBe(false);
  });

  it('签名错误 → false', async () => {
    expect(await isAdminAsync(makeTamperedRequest('admin'), validStore)).toBe(false);
  });

  it('role=user → false（无论会话是否有效）', async () => {
    expect(await isAdminAsync(makeRequest('user'), validStore)).toBe(false);
  });
});

describe('isOwnerAsync 信任链', () => {
  const validStore = makeSessionStore({ valid: true });
  const invalidStore = makeSessionStore({ valid: false });

  it('owner 有效 session → true', async () => {
    expect(await isOwnerAsync(makeRequest('owner'), validStore)).toBe(true);
  });

  it('owner 但 session 已撤销 → false', async () => {
    expect(await isOwnerAsync(makeRequest('owner'), invalidStore)).toBe(false);
  });

  it('admin 不是 owner → false', async () => {
    expect(await isOwnerAsync(makeRequest('admin'), validStore)).toBe(false);
  });

  it('无 cookie → false', async () => {
    expect(await isOwnerAsync(makeRequest(null), validStore)).toBe(false);
  });
});
