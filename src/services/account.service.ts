/**
 * 账号服务 — 注册 / 登录 / 登出 / 改密 / 重置 / 封禁 / owner bootstrap
 *
 * 邀请码门控注册（消费一次）+ 用户名密码登录 + Redis 会话。
 * 密码用 node:crypto scrypt 哈希（内置、无原生依赖、serverless 安全）+ 每用户 salt。
 * 零 PII：用户名是 handle，不收邮箱/手机。
 * 忘密唯一通道：站主 resetPassword（返回临时密码明文，仅显示一次）。
 * 防用户名枚举：登录失败统一 reason，不区分"用户不存在"与"密码错"。
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import type { AccountServicePort, AuthResult, RegisterInput } from './interfaces';
import type { AccountStatus, UserAccount, UserSession } from '@/stores/ports';
import { createAccountStore } from '@/stores/account.store';
import { createSessionStore } from '@/stores/session.store';
import { createUserProfileStore } from '@/stores/user-profile.store';
import { createInviteCodeStore } from '@/stores/invite-code.store';
import { createSessionId } from '@/lib/account-auth';
import { validatePersonaAnchor } from './profile.service';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天
const PASSWORD_MIN = 8;
const USERNAME_RE = /^[A-Za-z0-9_一-龥]{2,20}$/;

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const derived = scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** 固定 dummy 哈希：用户不存在时也对它跑一次 scrypt，拉平时延防用户名枚举（时序侧信道） */
const DUMMY_HASH = hashPassword('dummy-password-do-not-use');

function constantTimeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function inviteCodeHashOf(code: string): string {
  return createHash('sha256').update(code).digest('hex').slice(0, 24);
}

/** 生成临时密码（去掉易混淆字符 0/O/1/l/i） */
function randomTempPassword(len = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

export function createAccountService(): AccountServicePort {
  const accountStore = createAccountStore();
  const sessionStore = createSessionStore();
  const profileStore = createUserProfileStore();
  const inviteCodeStore = createInviteCodeStore();

  async function issueSession(username: string, role: UserAccount['role']): Promise<string> {
    const now = Date.now();
    const session: UserSession = {
      sessionId: createSessionId(),
      username,
      role,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    };
    await sessionStore.create(session);
    return session.sessionId;
  }

  return {
    async register(input: RegisterInput): Promise<AuthResult> {
      const username = input.username.trim();
      const inviteCode = input.inviteCode.trim();
      if (!USERNAME_RE.test(username)) {
        return { ok: false, reason: '用户名需 2-20 位（中英文/数字/下划线）' };
      }
      if (input.password.length < PASSWORD_MIN) {
        return { ok: false, reason: `密码至少 ${PASSWORD_MIN} 位` };
      }
      // 锚点 PII 先检（命中则拒绝，且不建账号）
      let anchor: string | undefined;
      if (input.personaAnchor !== undefined && input.personaAnchor.trim()) {
        try {
          anchor = validatePersonaAnchor(input.personaAnchor);
        } catch {
          return { ok: false, reason: '锚点含敏感信息，请重填' };
        }
      }
      // 邀请码校验
      const invite = await inviteCodeStore.findByCode(inviteCode);
      if (!invite) return { ok: false, reason: '邀请码无效' };
      if (invite.usedCount >= invite.maxUses) return { ok: false, reason: '邀请码已用完' };

      // 占用户名 + 建账号
      const now = new Date().toISOString();
      const account: UserAccount = {
        username,
        passwordHash: hashPassword(input.password),
        role: 'user',
        status: 'active',
        inviteCodeHash: inviteCodeHashOf(inviteCode),
        createdAt: now,
      };
      try {
        await accountStore.create(account);
      } catch {
        return { ok: false, reason: '用户名已存在' };
      }
      // 消费邀请（失败仅记日志，账号已建不阻断）
      try {
        await inviteCodeStore.incrementUsage(inviteCode);
      } catch {
        /* 邀请计数失败不影响注册 */
      }
      // 画像（锚点）
      if (anchor) {
        try {
          await profileStore.save({
            profileId: username,
            username,
            inviteCodeHash: account.inviteCodeHash,
            personaAnchor: anchor,
            consentForProfile: true,
            confidence: 1,
            createdAt: now,
            updatedAt: now,
          });
        } catch {
          /* 画像失败不阻断注册 */
        }
      }
      const sessionId = await issueSession(username, 'user');
      return { ok: true, sessionId, username, role: 'user' };
    },

    async login(username: string, password: string): Promise<AuthResult> {
      const account = await accountStore.findByUsername(username.trim());
      // 防时序侧信道：用户不存在时也对 dummy hash 跑一次 scrypt 拉平时延；文案统一防枚举
      if (!account) {
        verifyPassword(password, DUMMY_HASH);
        return { ok: false, reason: '用户名或密码错误' };
      }
      if (!verifyPassword(password, account.passwordHash)) {
        return { ok: false, reason: '用户名或密码错误' };
      }
      if (account.status === 'banned') return { ok: false, reason: '账号已封禁，联系站主' };
      if (account.status === 'deleteRequested') return { ok: false, reason: '账号已申请删除' };
      await accountStore.updateLastLogin(account.username, new Date().toISOString());
      const sessionId = await issueSession(account.username, account.role);
      return { ok: true, sessionId, username: account.username, role: account.role };
    },

    async logout(sessionId: string): Promise<void> {
      await sessionStore.revoke(sessionId);
    },

    async changePassword(username: string, currentPassword: string, newPassword: string) {
      const account = await accountStore.findByUsername(username);
      if (!account || !verifyPassword(currentPassword, account.passwordHash)) {
        return { ok: false, reason: '当前密码错误' };
      }
      if (newPassword.length < PASSWORD_MIN) return { ok: false, reason: `密码至少 ${PASSWORD_MIN} 位` };
      await accountStore.updatePasswordHash(username, hashPassword(newPassword));
      return { ok: true };
    },

    async resetPassword(username: string) {
      const account = await accountStore.findByUsername(username);
      if (!account) return { ok: false, reason: '用户不存在' };
      const temp = randomTempPassword();
      await accountStore.updatePasswordHash(username, hashPassword(temp));
      return { ok: true, newPassword: temp };
    },

    async setStatus(username: string, status: AccountStatus) {
      const account = await accountStore.findByUsername(username);
      if (!account) return { ok: false, reason: '用户不存在' };
      await accountStore.updateStatus(username, status);
      return { ok: true };
    },

    async listAccounts() {
      return accountStore.listAll();
    },

    async bootstrapOwner(adminPassword: string, ownerUsername: string, ownerPassword: string): Promise<AuthResult> {
      if (await accountStore.exists()) {
        return { ok: false, reason: '系统已有账号，bootstrap 已关闭' };
      }
      const expected = import.meta.env.ADMIN_PASSWORD;
      if (!expected) return { ok: false, reason: 'ADMIN_PASSWORD 未配置' };
      if (!constantTimeEqualString(adminPassword, expected)) {
        return { ok: false, reason: '密钥错误' };
      }
      if (!USERNAME_RE.test(ownerUsername) || ownerPassword.length < PASSWORD_MIN) {
        return { ok: false, reason: '用户名或密码不符合要求' };
      }
      const now = new Date().toISOString();
      const account: UserAccount = {
        username: ownerUsername,
        passwordHash: hashPassword(ownerPassword),
        role: 'admin',
        status: 'active',
        createdAt: now,
      };
      try {
        await accountStore.create(account);
      } catch {
        return { ok: false, reason: '用户名已存在' };
      }
      const sessionId = await issueSession(ownerUsername, 'admin');
      return { ok: true, sessionId, username: ownerUsername, role: 'admin' };
    },
  };
}
