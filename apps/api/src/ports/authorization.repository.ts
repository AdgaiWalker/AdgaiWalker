import type { AuthorizationGrantView } from '@walker/shared';
export const AUTHORIZATION_REPOSITORY = Symbol('AUTHORIZATION_REPOSITORY');
export interface AuthorizationRepositoryPort {
  create(grant: AuthorizationGrantView): Promise<AuthorizationGrantView>;
  find(id: string): Promise<AuthorizationGrantView | null>;
  revoke(id: string, now: Date): Promise<boolean>;
  list(agentId: string): Promise<AuthorizationGrantView[]>;
}
