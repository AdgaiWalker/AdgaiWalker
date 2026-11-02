/**
 * 用户体系轻量类型定义（阶段四挂接插槽）
 */
export type UserRole = 'visitor' | 'member' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
  createdAt: string;
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface AuthResult {
  token: string;
  user: UserProfile;
}

export interface AuthContext {
  actorType: 'guest' | 'user';
  userId?: string | null;
  email?: string | null;
  role?: UserRole;
  anonId?: string | null;
}
