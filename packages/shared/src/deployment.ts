/** 位置绑定（V04/V05）：公开位置的 Agent 部署视图与输入。成员钉住不可变修订。 */
import { isRecord } from './guards.js';

export type DeploymentMemberView = {
  id: string;
  agentRevisionId: string;
  agentId: string;
  revision: number;
  isDefault: boolean;
};

export type DeploymentView = {
  id: string;
  placementKey: string;
  scopeKind: string;
  scopeSlug: string;
  /** 每次保存/启用变更递增；更新按它做 CAS */
  generation: number;
  enabled: boolean;
  members: DeploymentMemberView[];
  updatedAt: string;
};

/** 公开位置清单；不含 prompt、凭据或修订原始配置。 */
export type PublicPlacementManifest = {
  placementKey: string;
  scopeSlug: string;
  label: string;
  available: boolean;
  aiEnabled: boolean;
  generation: number | null;
  defaultMemberKey: string | null;
  members: Array<{ key: string; name: string; revision: number; isDefault: boolean }>;
};

export type DeploymentMemberInput = { agentRevisionId: string; isDefault: boolean };

/** 首页小影只服务已核验的全站公开内容，不把访客传入的 slug 当任意范围。 */
export const HOME_XIAOYING_PLACEMENT = 'home-xiaoying';
export const PUBLIC_SITE_SCOPE = 'site-public';

/** 服务端登记的位置清单；未登记的位置一律拒绝。 */
export const REGISTERED_PLACEMENTS = [
  { key: 'post-detail', scopeKind: 'post', label: '文章详情' },
  { key: HOME_XIAOYING_PLACEMENT, scopeKind: 'site', label: '首页小影' },
] as const;
export type RegisteredPlacement = (typeof REGISTERED_PLACEMENTS)[number];

export function findPlacement(key: string): RegisteredPlacement | null {
  return REGISTERED_PLACEMENTS.find((placement) => placement.key === key) ?? null;
}

/** 文章位置只读该文；首页小影只读至少含一篇文章的已核验公开集合。 */
export function placementContentAvailable(
  placementKey: string,
  scopeSlug: string,
  citableSlugs: readonly string[],
): boolean {
  if (placementKey === HOME_XIAOYING_PLACEMENT) {
    return scopeSlug === PUBLIC_SITE_SCOPE && citableSlugs.length > 0;
  }
  return placementKey === 'post-detail' && citableSlugs.includes(scopeSlug);
}

export type DeploymentSaveInput = {
  placementKey: string;
  scopeSlug: string;
  members: DeploymentMemberInput[];
  expectedGeneration: number | null;
  deploymentId: string | null;
};

/** 严格解析保存请求：未知字段拒绝，默认成员数量交给仓储复核。 */
export function parseDeploymentSave(body: unknown): DeploymentSaveInput | null {
  if (!isRecord(body)) return null;
  const allowed = new Set(['placementKey', 'scopeSlug', 'members', 'expectedGeneration', 'deploymentId']);
  if (Object.keys(body).some((key) => !allowed.has(key))) return null;
  if (typeof body.placementKey !== 'string' || !findPlacement(body.placementKey)) return null;
  if (typeof body.scopeSlug !== 'string' || body.scopeSlug.trim() === '') return null;
  if (body.placementKey === HOME_XIAOYING_PLACEMENT && body.scopeSlug.trim() !== PUBLIC_SITE_SCOPE) return null;
  if (!Array.isArray(body.members) || body.members.length === 0) return null;
  const members: DeploymentMemberInput[] = [];
  for (const member of body.members) {
    if (!isRecord(member) || typeof member.agentRevisionId !== 'string' || member.agentRevisionId.trim() === '') return null;
    if (typeof member.isDefault !== 'boolean') return null;
    members.push({ agentRevisionId: member.agentRevisionId, isDefault: member.isDefault });
  }
  if (body.expectedGeneration !== null && (typeof body.expectedGeneration !== 'number' || !Number.isInteger(body.expectedGeneration) || body.expectedGeneration < 1)) return null;
  if (body.deploymentId !== undefined && body.deploymentId !== null && typeof body.deploymentId !== 'string') return null;
  return {
    placementKey: body.placementKey,
    scopeSlug: body.scopeSlug.trim(),
    members,
    expectedGeneration: body.expectedGeneration as number | null,
    deploymentId: typeof body.deploymentId === 'string' && body.deploymentId.trim() !== '' ? body.deploymentId : null,
  };
}

/** 解析启用/禁用/回退请求里的 generation CAS 字段。 */
export function parseGeneration(body: unknown): number | null {
  if (!isRecord(body) || typeof body.expectedGeneration !== 'number' || !Number.isInteger(body.expectedGeneration)) return null;
  return body.expectedGeneration;
}
