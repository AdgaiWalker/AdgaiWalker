import { isRecord } from './guards.js';

export const READ_ONLY_PROFILE = { id: 'read-only', version: 1 } as const;
export interface AgentRevisionInput {
  requestKey: string;
  baseVersion: number;
  name: string;
  prompt: string;
  providerId: string | null;
  modelId: string;
  toolProfile: typeof READ_ONLY_PROFILE;
}
export interface AgentRevisionView {
  id: string;
  agentId: string;
  version: number;
  prompt: string;
  providerId: string | null;
  modelId: string;
  toolProfile: typeof READ_ONLY_PROFILE;
  schemaVersion: number;
  configHash: string;
  createdAt: string;
}
export interface AgentRevisionDetail {
  id: string;
  name: string;
  archivedAt: string | null;
  revisions: AgentRevisionView[];
}

export function parseAgentRevisionInput(value: unknown): AgentRevisionInput | null {
  if (!isRecord(value)) return null;
  const allowed = ['requestKey', 'baseVersion', 'name', 'prompt', 'providerId', 'modelId', 'toolProfile'];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return null;
  if (typeof value.requestKey !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(value.requestKey)) return null;
  if (!Number.isSafeInteger(value.baseVersion) || (value.baseVersion as number) < 0) return null;
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100) return null;
  if (typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > 50_000) return null;
  if (value.providerId !== null && (typeof value.providerId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.providerId))) return null;
  if (typeof value.modelId !== 'string' || !value.modelId.trim() || value.modelId.length > 200) return null;
  if (!isRecord(value.toolProfile) || Object.keys(value.toolProfile).length !== 2 ||
      value.toolProfile.id !== READ_ONLY_PROFILE.id || value.toolProfile.version !== READ_ONLY_PROFILE.version) return null;
  return {
    requestKey: value.requestKey, baseVersion: value.baseVersion as number, name: value.name.trim(),
    prompt: value.prompt, providerId: value.providerId as string | null, modelId: value.modelId,
    toolProfile: { ...READ_ONLY_PROFILE },
  };
}
