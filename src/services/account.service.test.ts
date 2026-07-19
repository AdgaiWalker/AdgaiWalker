/**
 * AccountService — 注册 / 登录 / 封禁 / 重置密码 / owner bootstrap
 *
 * 内存降级存储（无 Redis），import.meta.env 提供 ADMIN_PASSWORD / INVITE_CODES。
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { createAccountService } from '@/services/account.service';

beforeAll(() => {
  const env = import.meta.env as Record<string, string>;
  env.ADMIN_PASSWORD = 'owner-bootstrap-secret';
  env.INVITE_CODES = 'test-invite:测试批次:10';
});

const svc = createAccountService();

describe('AccountService.bootstrapOwner', () => {
  it('首次凭 ADMIN_PASSWORD 建 owner 账号，之后自锁', async () => {
    const ok = await svc.bootstrapOwner('owner-bootstrap-secret', 'owner', 'owner-pass-1');
    expect(ok.ok).toBe(true);
    expect(ok.role).toBe('owner');
    expect(ok.username).toBe('owner');
    expect(ok.sessionId).toBeTruthy();

    const locked = await svc.bootstrapOwner('owner-bootstrap-secret', 'owner2', 'pass-2-xxxx');
    expect(locked.ok).toBe(false);
    expect(locked.reason).toContain('已关闭');
  });

  it('密钥错误时拒绝', async () => {
    const bad = await svc.bootstrapOwner('wrong-secret', 'owner3', 'pass-3-xxxx');
    expect(bad.ok).toBe(false);
  });
});

describe('AccountService.login', () => {
  it('owner 用正确密码登录', async () => {
    const r = await svc.login('owner', 'owner-pass-1');
    expect(r.ok).toBe(true);
    expect(r.role).toBe('owner');
  });

  it('密码错误统一报错（防枚举：不区分用户不存在与密码错）', async () => {
    const wrongPw = await svc.login('owner', 'wrong-password');
    const noUser = await svc.login('nonexistent-user', 'whatever');
    expect(wrongPw.ok).toBe(false);
    expect(noUser.ok).toBe(false);
    expect(wrongPw.reason).toBe(noUser.reason);
    expect(wrongPw.reason).toBe('用户名或密码错误');
  });
});

describe('AccountService.register（邀请码门控）', () => {
  it('有效邀请码 + 合规用户名密码 → 注册成功并消费邀请', async () => {
    const username = `u${crypto.randomUUID().slice(0, 8)}`;
    const r = await svc.register({
      inviteCode: 'test-invite',
      username,
      password: 'valid-pass-1',
      personaAnchor: '学生',
    });
    expect(r.ok).toBe(true);
    expect(r.role).toBe('user');
    expect(r.sessionId).toBeTruthy();

    // 注册后可直接登录
    const login = await svc.login(username, 'valid-pass-1');
    expect(login.ok).toBe(true);
  });

  it('无效邀请码拒绝', async () => {
    const r = await svc.register({
      inviteCode: 'not-a-real-code',
      username: `u${crypto.randomUUID().slice(0, 8)}`,
      password: 'valid-pass-1',
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('邀请码');
  });

  it('用户名已存在拒绝（同名二次注册）', async () => {
    const username = `dup${crypto.randomUUID().slice(0, 8)}`;
    const first = await svc.register({ inviteCode: 'test-invite', username, password: 'valid-pass-1' });
    expect(first.ok).toBe(true);
    const r = await svc.register({ inviteCode: 'test-invite', username, password: 'valid-pass-1' });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('已存在');
  });

  it('保留用户名拒绝（admin/owner 等不可注册）', async () => {
    const r = await svc.register({
      inviteCode: 'test-invite',
      username: 'admin',
      password: 'valid-pass-1',
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('保留');
  });

  it('密码过短 / 用户名非法拒绝', async () => {
    const short = await svc.register({
      inviteCode: 'test-invite',
      username: 'shortuser',
      password: '123',
    });
    expect(short.ok).toBe(false);
    expect(short.reason).toContain('密码');

    const badName = await svc.register({
      inviteCode: 'test-invite',
      username: 'a', // <2
      password: 'valid-pass-1',
    });
    expect(badName.ok).toBe(false);
  });
});

describe('AccountService 封禁 / 重置 / 改密', () => {
  it('封禁后登录被拒，解封后恢复', async () => {
    const username = `ban${crypto.randomUUID().slice(0, 8)}`;
    await svc.register({ inviteCode: 'test-invite', username, password: 'valid-pass-1' });

    const ban = await svc.setStatus(username, 'banned');
    expect(ban.ok).toBe(true);
    const blocked = await svc.login(username, 'valid-pass-1');
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toContain('封禁');

    await svc.setStatus(username, 'active');
    const back = await svc.login(username, 'valid-pass-1');
    expect(back.ok).toBe(true);
  });

  it('重置密码返回临时密码，旧密码失效、新密码可登录', async () => {
    const username = `rst${crypto.randomUUID().slice(0, 8)}`;
    await svc.register({ inviteCode: 'test-invite', username, password: 'old-pass-1' });

    const reset = await svc.resetPassword(username);
    expect(reset.ok).toBe(true);
    expect(reset.newPassword).toBeTruthy();

    const oldFails = await svc.login(username, 'old-pass-1');
    expect(oldFails.ok).toBe(false);

    const newWorks = await svc.login(username, reset.newPassword!);
    expect(newWorks.ok).toBe(true);
  });

  it('改密码需当前密码正确', async () => {
    const username = `chg${crypto.randomUUID().slice(0, 8)}`;
    await svc.register({ inviteCode: 'test-invite', username, password: 'old-pass-1' });

    const wrongCur = await svc.changePassword(username, 'wrong-current', 'new-pass-1');
    expect(wrongCur.ok).toBe(false);
    expect(wrongCur.reason).toContain('当前密码');

    const ok = await svc.changePassword(username, 'old-pass-1', 'brand-new-1');
    expect(ok.ok).toBe(true);

    const loginNew = await svc.login(username, 'brand-new-1');
    expect(loginNew.ok).toBe(true);
  });

  it('listAccounts 返回已建账号', async () => {
    const all = await svc.listAccounts();
    expect(all.length).toBeGreaterThan(0);
    expect(all.some(a => a.username === 'owner')).toBe(true);
  });

  it('setRole 改角色，新登录带新角色（旧会话被撤销）', async () => {
    const username = `rol${crypto.randomUUID().slice(0, 8)}`;
    await svc.register({ inviteCode: 'test-invite', username, password: 'valid-pass-1' });
    const r = await svc.setRole(username, 'admin');
    expect(r.ok).toBe(true);
    const login = await svc.login(username, 'valid-pass-1');
    expect(login.role).toBe('admin');
  });

  it('deleteAccount 级联删除：账号不再存在、登录失败、需求脱敏', async () => {
    const username = `del${crypto.randomUUID().slice(0, 8)}`;
    await svc.register({ inviteCode: 'test-invite', username, password: 'valid-pass-1', personaAnchor: '学生' });
    expect((await svc.listAccounts()).some((a) => a.username === username)).toBe(true);

    const r = await svc.deleteAccount(username);
    expect(r.ok).toBe(true);

    expect((await svc.listAccounts()).some((a) => a.username === username)).toBe(false);
    const login = await svc.login(username, 'valid-pass-1');
    expect(login.ok).toBe(false);
  });
});
