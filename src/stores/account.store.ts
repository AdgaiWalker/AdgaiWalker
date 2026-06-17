/**
 * Account Store — 实现 AccountRepositoryPort
 *
 * 注册账号存储（用户名 + scrypt 密码哈希，零 PII）。Redis + 内存降级，自包含。
 * 维护一个集合 key `auth:accounts`（sadd username）便于 listAll / exists。
 */

import type { AccountRepositoryPort, AccountStatus, UserAccount } from './ports';
import { getRedis } from '@/conversation/store';

// 内存降级存储（按 username 索引）
const memoryAccounts = new Map<string, UserAccount>();

// Redis key 约定
function accountKey(username: string): string {
  return `auth:account:${username}`;
}

const ACCOUNTS_SET = 'auth:accounts';

/** 读出现有账号并合并写回（redis/内存都同步） */
async function mergeWrite(
  username: string,
  patch: Partial<UserAccount>,
): Promise<void> {
  const redis = getRedis();
  const memory = memoryAccounts.get(username);
  if (memory) {
    memoryAccounts.set(username, { ...memory, ...patch });
  }
  if (!redis) return;
  const current = await redis.get<UserAccount>(accountKey(username));
  if (!current) return;
  await redis.set(accountKey(username), { ...current, ...patch });
}

export function createAccountStore(): AccountRepositoryPort {
  return {
    async findByUsername(username: string): Promise<UserAccount | null> {
      const redis = getRedis();
      if (!redis) return memoryAccounts.get(username) ?? null;
      return (await redis.get<UserAccount>(accountKey(username))) ?? memoryAccounts.get(username) ?? null;
    },

    async create(account: UserAccount): Promise<void> {
      // 内存先判重
      if (memoryAccounts.has(account.username)) {
        throw new Error('用户名已存在');
      }
      const redis = getRedis();
      if (!redis) {
        memoryAccounts.set(account.username, account);
        return;
      }
      // 原子占位：nx 失败 = 已存在
      const ok = await redis.set(accountKey(account.username), account, { nx: true });
      if (!ok) {
        throw new Error('用户名已存在');
      }
      try {
        await redis.sadd(ACCOUNTS_SET, account.username);
      } catch (e) {
        // sadd 失败 → 回滚 key，避免 exists()/listAll 与实际账号不一致
        await redis.del(accountKey(account.username));
        throw e;
      }
      memoryAccounts.set(account.username, account);
    },

    async updateStatus(username: string, status: AccountStatus): Promise<void> {
      await mergeWrite(username, { status });
    },

    async updatePasswordHash(username: string, passwordHash: string): Promise<void> {
      await mergeWrite(username, { passwordHash });
    },

    async updateLastLogin(username: string, at: string): Promise<void> {
      await mergeWrite(username, { lastLoginAt: at });
    },

    async listAll(): Promise<UserAccount[]> {
      const redis = getRedis();
      if (!redis) return [...memoryAccounts.values()];
      const usernames = await redis.smembers(ACCOUNTS_SET);
      const items = await Promise.all(usernames.map(u => redis.get<UserAccount>(accountKey(u))));
      return items.filter((a): a is UserAccount => a !== null);
    },

    async exists(): Promise<boolean> {
      const redis = getRedis();
      if (!redis) return memoryAccounts.size > 0;
      const count = await redis.scard(ACCOUNTS_SET);
      return count > 0;
    },
  };
}
