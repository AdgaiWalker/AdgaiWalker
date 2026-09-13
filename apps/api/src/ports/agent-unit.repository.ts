/**
 * 智能体仓库端口
 * 职责：Agent 人设与模型挂载持久化。
 */
export type AgentUnitRow = {
  id: string;
  name: string;
  icon: string;
  isSystem: boolean;
  providerId: string | null;
  modelId: string;
  prompt: string;
  createdAt: Date;
  updatedAt: Date;
};

export const AGENT_UNIT_REPOSITORY = Symbol('AGENT_UNIT_REPOSITORY');

export interface AgentUnitRepositoryPort {
  list(): Promise<AgentUnitRow[]>;
  findById(id: string): Promise<AgentUnitRow | null>;
  save(row: Omit<AgentUnitRow, 'createdAt' | 'updatedAt'>): Promise<AgentUnitRow>;
  remove(id: string): Promise<void>;
}
