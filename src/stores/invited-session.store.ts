/**
 * Invited Session Store — 实现 InvitedSessionRepositoryPort
 *
 * 委托给 conversation/store.ts 的 invited session 存储（Redis + 内存降级）。
 */

import type { InvitedSession, InvitedSessionRepositoryPort } from './ports';

import {
  getInvitedSession,
  isInvitedSessionValid,
  revokeInvitedSession,
  saveInvitedSession,
} from '@/conversation/store';

export function createInvitedSessionStore(): InvitedSessionRepositoryPort {
  return {
    async create(session: InvitedSession): Promise<void> {
      await saveInvitedSession(session);
    },

    async get(sessionId: string): Promise<InvitedSession | null> {
      return getInvitedSession(sessionId);
    },

    async isValid(sessionId: string): Promise<boolean> {
      return isInvitedSessionValid(sessionId);
    },

    async revoke(sessionId: string): Promise<void> {
      await revokeInvitedSession(sessionId);
    },
  };
}
