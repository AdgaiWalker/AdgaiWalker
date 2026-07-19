/**
 * User Profile Store — 实现 UserProfileRepositoryPort
 *
 * 画像领域存储（Redis + 内存降级），按账号 username 索引。
 * 键约定：
 *   match:profile:{profileId}             单实体（按 profileId）
 *   match:profile-by-username:{username}  按 username 索引（账号认证后主键）
 */
import { getRedis } from '@/stores/redis-client';

import type { UserProfile, UserProfileRepositoryPort } from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储
// ---------------------------------------------------------------------------

const memoryProfiles = new Map<string, UserProfile>();

// ---------------------------------------------------------------------------
// Redis key 约定
// ---------------------------------------------------------------------------

function profileKey(profileId: string): string {
  return `match:profile:${profileId}`;
}

/** 按 username 索引画像，账号认证后用 username 取代旧 sessionId */
function profileByUsernameKey(username: string): string {
  return `match:profile-by-username:${username}`;
}

// ---------------------------------------------------------------------------
// 用户画像 CRUD（按 username 索引）
// ---------------------------------------------------------------------------

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const redis = getRedis();
  memoryProfiles.set(profile.profileId, profile);
  if (!redis) return;
  await redis.set(profileKey(profile.profileId), profile);
  await redis.set(profileByUsernameKey(profile.username), profile);
}

export async function getUserProfileByUsername(username: string): Promise<UserProfile | null> {
  const redis = getRedis();
  const fromMemory = [...memoryProfiles.values()].find(p => p.username === username) ?? null;
  if (!redis) return fromMemory;
  return (await redis.get<UserProfile>(profileByUsernameKey(username))) ?? fromMemory;
}

/** 物理删画像（删账号级联用） */
export async function deleteUserProfileByUsername(username: string): Promise<void> {
  for (const [pid, p] of memoryProfiles) {
    if (p.username === username) memoryProfiles.delete(pid);
  }
  const redis = getRedis();
  if (!redis) return;
  await redis.del(profileKey(username));
  await redis.del(profileByUsernameKey(username));
}

export async function getAllUserProfiles(): Promise<UserProfile[]> {
  const redis = getRedis();
  if (!redis) return [...memoryProfiles.values()];
  const keys = await redis.keys('match:profile-by-username:*');
  const items = await Promise.all(keys.map(k => redis.get<UserProfile>(k)));
  return items.filter((p): p is UserProfile => p !== null);
}

export async function markUserProfileDeleteRequested(username: string, requestedAt: string): Promise<void> {
  const redis = getRedis();
  const memory = [...memoryProfiles.values()].find(p => p.username === username);
  if (memory) {
    memoryProfiles.set(memory.profileId, { ...memory, deleteRequestedAt: requestedAt, updatedAt: requestedAt });
  }
  if (!redis) return;
  const current = await redis.get<UserProfile>(profileByUsernameKey(username));
  if (!current) return;
  const updated = { ...current, deleteRequestedAt: requestedAt, updatedAt: requestedAt };
  await redis.set(profileKey(current.profileId), updated);
  await redis.set(profileByUsernameKey(username), updated);
}

// ---------------------------------------------------------------------------
// UserProfileRepositoryPort 工厂
// ---------------------------------------------------------------------------

export function createUserProfileStore(): UserProfileRepositoryPort {
  return {
    async save(profile: UserProfile): Promise<void> {
      await saveUserProfile(profile);
    },

    async findByUsername(username: string): Promise<UserProfile | null> {
      return getUserProfileByUsername(username);
    },

    async findAll(): Promise<UserProfile[]> {
      return getAllUserProfiles();
    },

    async markDeleteRequested(username: string, requestedAt: string): Promise<void> {
      await markUserProfileDeleteRequested(username, requestedAt);
    },

    async deleteByUsername(username: string): Promise<void> {
      await deleteUserProfileByUsername(username);
    },
  };
}
