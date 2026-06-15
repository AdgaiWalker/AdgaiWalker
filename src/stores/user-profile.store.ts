/**
 * User Profile Store — 实现 UserProfileRepositoryPort
 *
 * 委托给 conversation/store.ts 的画像存储（Redis + 内存降级）。
 */

import type { UserProfile, UserProfileRepositoryPort } from './ports';

import {
  getAllUserProfiles,
  getUserProfileBySession,
  markUserProfileDeleteRequested,
  saveUserProfile,
} from '@/conversation/store';

export function createUserProfileStore(): UserProfileRepositoryPort {
  return {
    async save(profile: UserProfile): Promise<void> {
      await saveUserProfile(profile);
    },

    async findBySessionId(sessionId: string): Promise<UserProfile | null> {
      return getUserProfileBySession(sessionId);
    },

    async findAll(): Promise<UserProfile[]> {
      return getAllUserProfiles();
    },

    async markDeleteRequested(sessionId: string, requestedAt: string): Promise<void> {
      await markUserProfileDeleteRequested(sessionId, requestedAt);
    },
  };
}
