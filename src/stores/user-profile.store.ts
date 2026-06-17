/**
 * User Profile Store — 实现 UserProfileRepositoryPort
 *
 * 委托给 conversation/store.ts 的画像存储（Redis + 内存降级）。
 * 按账号 username 索引。
 */

import type { UserProfile, UserProfileRepositoryPort } from './ports';

import {
  deleteUserProfileByUsername,
  getAllUserProfiles,
  getUserProfileByUsername,
  markUserProfileDeleteRequested,
  saveUserProfile,
} from '@/conversation/store';

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
