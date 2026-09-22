import type { AgentRevisionDetail, AgentRevisionView, AgentRevisionInput } from '@walker/shared';

export const AGENT_REVISION_REPOSITORY = Symbol('AGENT_REVISION_REPOSITORY');
export interface AgentRevisionRepositoryPort {
  list(): Promise<import('@walker/shared').OpsAgent[]>;
  save(input: {
    agentId: string; revisionId: string; configHash: string; actor: string;
    create: boolean; config: AgentRevisionInput;
  }): Promise<AgentRevisionView>;
  detail(agentId: string): Promise<AgentRevisionDetail | null>;
  archive(agentId: string, actor: string): Promise<void>;
  importLegacy(actor: string): Promise<number>;
}
