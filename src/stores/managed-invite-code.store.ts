/**
 * Managed Invite Code Store — 后台生成的邀请码（Redis 持久化）
 *
 * 与 env INVITE_CODES 并行：env 码仍有效（一次性种子），managed 码后台可生成/禁用/删除。
 * 默认一人一码（maxUses=1），也支持共享多码（maxUses>1）。
 * usedBy 追踪：注册时记录哪个账号用了此码。
 */
import { randomBytes } from 'node:crypto';
import { getRedis } from '@/conversation/store';

export interface ManagedInviteCode {
  code: string;
  label: string;
  maxUses: number;
  usedCount: number;
  createdAt: string;
  createdBy: string;
  status: 'active' | 'disabled';
  usedBy: string[];
}

const SET_KEY = 'auth:invite-codes';
const codeKey = (code: string) => `auth:invite-code:${code}`;

function genCode(): string {
  return `walker-${randomBytes(3).toString('hex')}`;
}

export function createManagedInviteCodeStore() {
  const memoryCodes = new Map<string, ManagedInviteCode>();

  async function mergeWrite(code: string, patch: Partial<ManagedInviteCode>, addUsedBy?: string): Promise<void> {
    const redis = getRedis();
    const mem = memoryCodes.get(code);
    if (mem) {
      memoryCodes.set(code, {
        ...mem,
        ...patch,
        usedBy: addUsedBy ? Array.from(new Set([...mem.usedBy, addUsedBy])) : mem.usedBy,
        usedCount: addUsedBy ? mem.usedCount + 1 : mem.usedCount,
      });
    }
    if (!redis) return;
    const cur = await redis.get<ManagedInviteCode>(codeKey(code));
    if (!cur) return;
    const updated: ManagedInviteCode = {
      ...cur,
      ...patch,
      usedBy: addUsedBy ? Array.from(new Set([...(cur.usedBy ?? []), addUsedBy])) : cur.usedBy,
      usedCount: addUsedBy ? (cur.usedCount ?? 0) + 1 : cur.usedCount,
    };
    await redis.set(codeKey(code), updated);
  }

  return {
    async findByCode(code: string): Promise<ManagedInviteCode | null> {
      const redis = getRedis();
      if (!redis) return memoryCodes.get(code) ?? null;
      return (await redis.get<ManagedInviteCode>(codeKey(code))) ?? memoryCodes.get(code) ?? null;
    },

    /** 生成 count 个码，每个 maxUses 次。默认一人一码：count=N, maxUses=1 */
    async generate(input: { label: string; count: number; maxUses: number; createdBy: string }): Promise<ManagedInviteCode[]> {
      const redis = getRedis();
      const now = new Date().toISOString();
      const out: ManagedInviteCode[] = [];
      const n = Math.max(1, Math.min(input.count, 500)); // 单次最多 500，防误操作
      for (let i = 0; i < n; i++) {
        let code = genCode();
        if (redis && (await redis.get(codeKey(code)))) code = genCode(); // 极低概率撞，重生成一次
        const rec: ManagedInviteCode = {
          code,
          label: input.label,
          maxUses: Math.max(1, input.maxUses),
          usedCount: 0,
          createdAt: now,
          createdBy: input.createdBy,
          status: 'active',
          usedBy: [],
        };
        out.push(rec);
        memoryCodes.set(code, rec);
        if (redis) {
          await redis.set(codeKey(code), rec);
          await redis.sadd(SET_KEY, code);
        }
      }
      return out;
    },

    async listAll(): Promise<ManagedInviteCode[]> {
      const redis = getRedis();
      if (!redis) return [...memoryCodes.values()];
      const codes = await redis.smembers<string[]>(SET_KEY);
      const items = await Promise.all(codes.map((c) => redis.get<ManagedInviteCode>(codeKey(c))));
      return items.filter((x): x is ManagedInviteCode => x !== null);
    },

    async disable(code: string): Promise<void> {
      await mergeWrite(code, { status: 'disabled' });
    },

    async delete(code: string): Promise<void> {
      memoryCodes.delete(code);
      const redis = getRedis();
      if (!redis) return;
      await redis.del(codeKey(code));
      await redis.srem(SET_KEY, code);
    },

    async recordUsedBy(code: string, username: string): Promise<void> {
      await mergeWrite(code, {}, username);
    },
  };
}
