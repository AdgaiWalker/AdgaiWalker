import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  findPlacement,
  parseDeploymentSave,
  READ_ONLY_PROFILE,
  type DeploymentMemberInput,
  type DeploymentView,
  type PublicPlacementManifest,
} from '@walker/shared';
import { ApiError, validationError } from '../common/http-error';
import { DEPLOYMENT_REPOSITORY, type DeploymentRepositoryPort } from '../ports/deployment.repository';
import { AGENT_REVISION_REPOSITORY, type AgentRevisionRepositoryPort } from '../ports/agent-revision.repository';
import { ReleaseTestService } from '../execution/release-test.service';
import { PublicReadinessService } from './public-readiness.service';

/**
 * 部署用例（V05）：测试通过 + 工具版本核对 → 确认后才 enabled；
 * 禁用保留历史成员并立即阻断位置解析；回退只能切到已合格的成员修订。
 */
@Injectable()
export class DeploymentService {
  constructor(
    @Inject(DEPLOYMENT_REPOSITORY) private readonly deployments: DeploymentRepositoryPort,
    @Inject(AGENT_REVISION_REPOSITORY) private readonly agents: AgentRevisionRepositoryPort,
    @Inject(ReleaseTestService) private readonly releaseTests: ReleaseTestService,
    @Inject(PublicReadinessService) private readonly readiness: PublicReadinessService,
  ) {}

  list() {
    return this.deployments.list();
  }

  /** 公共文章页只拿位置状态和成员展示名，不返回 prompt、模型目录或凭据引用。 */
  async publicManifest(placementKey: string, scopeSlug: string): Promise<Omit<PublicPlacementManifest, 'aiEnabled'>> {
    const placement = findPlacement(placementKey);
    if (!placement) throw new ApiError('placement-not-found', 404, '找不到这个访客位置');
    const unavailable: Omit<PublicPlacementManifest, 'aiEnabled'> = {
      placementKey,
      scopeSlug,
      label: placement.label,
      available: false,
      generation: null,
      defaultMemberKey: null,
      members: [],
    };
    const deployment = await this.deployments.findByPlacement(placementKey, placement.scopeKind, scopeSlug);
    if (!deployment?.enabled) return unavailable;
    const readiness = await this.readiness.inspectDeployment(deployment).catch(() => null);
    if (!readiness?.canEnable) return unavailable;
    const eligible = await this.qualifiedPublicMembers(placementKey, scopeSlug).catch(() => null);
    if (!eligible) return unavailable;
    const members = eligible.members.map(({ key, name, revision, isDefault }) => ({ key, name, revision, isDefault }));
    return {
      ...unavailable,
      available: members.length > 0,
      generation: eligible.generation,
      defaultMemberKey: members.find((member) => member.isDefault)?.key ?? null,
      members,
    };
  }

  /** 按当前启用部署解析公开成员；revisionKey 只在该位置当前成员集合内有效。 */
  async resolvePublicMember(placementKey: string, scopeSlug: string, memberKey: string | null, generation: number | null) {
    const placement = findPlacement(placementKey);
    if (!placement) throw new ApiError('placement-not-found', 404, '找不到这个访客位置');
    const deployment = await this.deployments.findByPlacement(placementKey, placement.scopeKind, scopeSlug);
    if (!deployment?.enabled) return null;
    const readiness = await this.readiness.inspectDeployment(deployment).catch(() => null);
    if (!readiness?.canEnable) {
      throw new ApiError('public-readiness-blocked', 503, '该位置尚未通过启用前检查');
    }
    if (!memberKey || generation !== deployment.generation) {
      throw new ApiError('placement-generation-conflict', 409, '公开成员列表已更新，请刷新后重试');
    }
    const selected = deployment.members.find((member) => member.id === memberKey);
    if (!selected) throw new ApiError('placement-generation-conflict', 409, '这个成员已不在当前公开位置，请刷新后重试');
    const eligible = await this.qualifiedPublicMembers(placementKey, scopeSlug);
    if (!eligible || eligible.generation !== generation) {
      throw new ApiError('placement-generation-conflict', 409, '公开成员列表已更新，请刷新后重试');
    }
    const qualifiedMember = eligible.members.find((member) => member.key === selected.id);
    if (!qualifiedMember) {
      throw new ApiError('placement-member-unavailable', 409, '这个成员当前不可用，请刷新后重试');
    }
    return {
      deploymentId: deployment.id,
      generation: deployment.generation,
      agentRevisionId: selected.agentRevisionId,
      agentId: selected.agentId,
      revision: qualifiedMember.revision,
    };
  }

  /** 用于恢复访客历史；revision ID 只在服务端用来过滤当前仍公开的回复。 */
  async publicHistoryMembers(placementKey: string, scopeSlug: string) {
    const placement = findPlacement(placementKey);
    if (!placement) throw new ApiError('placement-not-found', 404, '找不到这个访客位置');
    const eligible = await this.qualifiedPublicMembers(placementKey, scopeSlug);
    return {
      generation: eligible?.generation ?? null,
      revisions: new Map((eligible?.members ?? []).map((member) => [
        member.agentRevisionId,
        { name: member.name, revision: member.revision },
      ])),
    };
  }

  private async qualifiedPublicMembers(placementKey: string, scopeSlug: string) {
    const placement = findPlacement(placementKey);
    if (!placement) return null;
    const deployment = await this.deployments.findByPlacement(placementKey, placement.scopeKind, scopeSlug);
    if (!deployment?.enabled) return null;
    const members: Array<{
      key: string;
      agentRevisionId: string;
      agentId: string;
      name: string;
      revision: number;
      isDefault: boolean;
    }> = [];
    for (const member of deployment.members) {
      const detail = await this.agents.detail(member.agentId).catch(() => null);
      const revision = detail?.revisions.find((item) => item.id === member.agentRevisionId);
      if (!detail || detail.archivedAt || !revision ||
          revision.toolProfile.id !== READ_ONLY_PROFILE.id || revision.toolProfile.version !== READ_ONLY_PROFILE.version) continue;
      const report = await this.releaseTests.report(member.agentId, member.agentRevisionId).catch(() => null);
      if (!report?.gate.ok) continue;
      members.push({
        key: member.id,
        agentRevisionId: member.agentRevisionId,
        agentId: member.agentId,
        name: detail.name,
        revision: revision.version,
        isDefault: member.isDefault,
      });
    }
    return { generation: deployment.generation, members };
  }

  async detail(id: string) {
    const found = await this.deployments.detail(id);
    if (!found) throw new ApiError('deployment-not-found', 404, '找不到部署');
    return found;
  }

  /** 保存部署草稿；启用中的部署须先禁用，避免绕过发布测试。 */
  async save(body: unknown, actor: string) {
    const input = parseDeploymentSave(body);
    if (!input) throw validationError('部署请求字段无效');
    const placement = findPlacement(input.placementKey)!;
    return this.deployments.save({
      deploymentId: input.deploymentId ?? `dep-${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      actor,
      requestId: `dep-${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      placementKey: input.placementKey,
      scopeKind: placement.scopeKind,
      scopeSlug: input.scopeSlug,
      members: input.members,
      expectedGeneration: input.expectedGeneration,
    });
  }

  /** 启用：每个成员修订都须当前配置三类测试通过 + 工具 profile 为当前版本。失败不做任何变更。 */
  async enable(id: string, expectedGeneration: number | null, actor: string) {
    if (expectedGeneration === null) throw validationError('缺少 expectedGeneration');
    const deployment = await this.detail(id);
    const readiness = await this.readiness.inspectDeployment(deployment);
    const memberPermissions = readiness.gates.find((gate) => gate.key === 'memberPermissions');
    if (memberPermissions?.state !== 'ready') {
      throw new ApiError('release-test-failed', 403, memberPermissions?.reason ?? '成员权限测试未通过');
    }
    const blocked = readiness.gates.filter((gate) => gate.state !== 'ready');
    if (blocked.length > 0) throw new ApiError('public-readiness-blocked', 409, blocked.map((gate) => gate.reason).join('；'));
    if (deployment.enabled) return deployment;
    return this.deployments.setEnabled({ id, enabled: true, expectedGeneration, actor, requestId: `dep-${randomUUID().replace(/-/g, '').slice(0, 12)}` });
  }

  /** 禁用：保留历史成员；位置解析立即失效。 */
  async disable(id: string, expectedGeneration: number | null, actor: string) {
    if (expectedGeneration === null) throw validationError('缺少 expectedGeneration');
    await this.detail(id);
    return this.deployments.setEnabled({ id, enabled: false, expectedGeneration, actor, requestId: `dep-${randomUUID().replace(/-/g, '').slice(0, 12)}` });
  }

  /** 回退：把默认成员切到同一部署里已合格的旧修订。 */
  async rollback(id: string, body: unknown, actor: string) {
    const target = typeof (body as { agentRevisionId?: unknown } | null)?.agentRevisionId === 'string'
      ? (body as { agentRevisionId: string }).agentRevisionId
      : null;
    const expectedGeneration = typeof (body as { expectedGeneration?: unknown } | null)?.expectedGeneration === 'number'
      ? (body as { expectedGeneration: number }).expectedGeneration
      : null;
    if (!target || expectedGeneration === null || !Number.isInteger(expectedGeneration)) throw validationError('回退请求字段无效');
    const deployment = await this.detail(id);
    const member = deployment.members.find((item) => item.agentRevisionId === target);
    if (!member) throw new ApiError('rollback-not-member', 422, '只能回退到部署已有成员的修订');
    await this.requireQualified(member.agentId, member.agentRevisionId);
    if (deployment.enabled) {
      const readiness = await this.readiness.inspectDeployment(deployment);
      if (!readiness.canEnable) {
        throw new ApiError('public-readiness-blocked', 409, readiness.gates.filter((gate) => gate.state !== 'ready').map((gate) => gate.reason).join('；'));
      }
    }
    const members: DeploymentMemberInput[] = deployment.members.map((item) => ({
      agentRevisionId: item.agentRevisionId,
      isDefault: item.agentRevisionId === target,
    }));
    return this.deployments.save({
      deploymentId: `dep-${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      actor,
      requestId: `dep-${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      placementKey: deployment.placementKey,
      scopeKind: deployment.scopeKind,
      scopeSlug: deployment.scopeSlug,
      members,
      expectedGeneration,
      allowEnabledUpdate: true,
    });
  }

  /**
   * 位置解析（V10 的公开问答入口也走这里）：只有 enabled 的部署才返回默认成员。
   * 禁用后下一次解析立即为 null——禁用立即阻止新问答。
   */
  async resolve(placementKey: string, scopeSlug: string) {
    const placement = findPlacement(placementKey);
    if (!placement) return null;
    const deployment = await this.deployments.findByPlacement(placementKey, placement.scopeKind, scopeSlug);
    if (!deployment || !deployment.enabled) return null;
    const readiness = await this.readiness.inspectDeployment(deployment).catch(() => null);
    if (!readiness?.canEnable) return null;
    const defaultMember = deployment.members.find((member) => member.isDefault);
    if (!defaultMember) return null;
    // Per-Agent model settings and Key can change after enable; stale release evidence
    // must stop new public requests immediately.
    try {
      const report = await this.releaseTests.report(defaultMember.agentId, defaultMember.agentRevisionId);
      if (!report.gate.ok) return null;
    } catch { return null; }
    return {
      deploymentId: deployment.id,
      generation: deployment.generation,
      agentRevisionId: defaultMember.agentRevisionId,
      agentId: defaultMember.agentId,
      revision: defaultMember.revision,
    };
  }

  private async requireQualified(agentId: string, agentRevisionId: string) {
    const detail = await this.agents.detail(agentId);
    const revision = detail?.revisions.find((item) => item.id === agentRevisionId);
    if (!detail || detail.archivedAt || !revision) throw new ApiError('execution-denied', 403, '成员修订不可用');
    if (revision.toolProfile.id !== READ_ONLY_PROFILE.id || revision.toolProfile.version !== READ_ONLY_PROFILE.version) {
      throw new ApiError('tool-profile-stale', 409, '工具配置不是当前版本，不能部署');
    }
    const report = await this.releaseTests.report(agentId, agentRevisionId);
    if (!report.gate.ok) throw new ApiError('release-test-failed', 403, report.gate.reason);
  }
}
