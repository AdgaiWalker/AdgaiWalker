import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { PublicDeploymentReadiness, PublicReadinessGate, PublicReadinessGateKey } from '@walker/shared';
import { placementContentAvailable, READ_ONLY_PROFILE } from '@walker/shared';
import { ApiError } from '../common/http-error';
import { LOG_RESOURCE_REPOSITORY, type LogResourceRepositoryPort } from '../ports/log-resource.repository';
import {
  DEFAULT_AGGREGATE_RETENTION_DAYS,
  DEFAULT_DETAIL_RETENTION_DAYS,
  LogResourceService,
} from '../log-resources/log-resource.service';
import { DeletionManifestReplayService } from '../log-resources/deletion-manifest-replay.service';
import { DEPLOYMENT_REPOSITORY, type DeploymentRepositoryPort } from '../ports/deployment.repository';
import type { DeploymentView } from '@walker/shared';
import { AGENT_REVISION_REPOSITORY, type AgentRevisionRepositoryPort } from '../ports/agent-revision.repository';
import { ReleaseTestService } from '../execution/release-test.service';
import { SITE_CONTENT_INDEX, type SiteContentIndexPort } from '../ports/site-content-index.port';
import { PUBLIC_ROUTE_BOUNDARY, type PublicRouteBoundaryPort } from '../ports/public-route-boundary.port';
import os from 'node:os';
import { memoryHeadroomOk, resolveMinFreeMemoryMb } from '@walker/shared';
import { runtimeProbePassed, readRuntimeProbe } from '../runtime/probe-gate';
import { isRestoreGatePending, resolveRestoreGatePath } from '../runtime/restore-gate';

@Injectable()
export class PublicReadinessService {
  constructor(
    @Inject(DEPLOYMENT_REPOSITORY) private readonly deployments: DeploymentRepositoryPort,
    @Inject(AGENT_REVISION_REPOSITORY) private readonly agents: AgentRevisionRepositoryPort,
    @Inject(ReleaseTestService) private readonly releaseTests: ReleaseTestService,
    @Inject(SITE_CONTENT_INDEX) private readonly content: SiteContentIndexPort,
    @Inject(LogResourceService) private readonly logs: LogResourceService,
    @Inject(LOG_RESOURCE_REPOSITORY) private readonly resources: LogResourceRepositoryPort,
    @Inject(DeletionManifestReplayService) private readonly deletionReplay: DeletionManifestReplayService,
    @Inject(PUBLIC_ROUTE_BOUNDARY) private readonly publicRoutes: PublicRouteBoundaryPort,
  ) {}

  async inspect(id: string, now = new Date()): Promise<PublicDeploymentReadiness> {
    const deployment = await this.deployments.detail(id);
    if (!deployment) throw new ApiError('deployment-not-found', HttpStatus.NOT_FOUND, '找不到部署');
    return this.inspectDeployment(deployment, now);
  }

  async inspectDeployment(deployment: DeploymentView, now = new Date()): Promise<PublicDeploymentReadiness> {
    const gates = await Promise.all([
      this.snapshotGate(deployment),
      this.memberPermissionGate(deployment),
      this.runtimeGate(),
      this.retentionGate(),
      this.deletionGate(),
      Promise.resolve(this.routeGate()),
      Promise.resolve(this.resourceHeadroomGate()),
    ]);
    return {
      deploymentId: deployment.id,
      placementKey: deployment.placementKey,
      scopeSlug: deployment.scopeSlug,
      enabled: deployment.enabled,
      checkedAt: now.toISOString(),
      canEnable: gates.every((gate) => gate.state === 'ready'),
      gates,
    };
  }

  private async snapshotGate(deployment: DeploymentView): Promise<PublicReadinessGate> {
    try {
      const snapshot = await this.content.loadCitableSnapshot();
      const validHash = /^[a-f0-9]{64}$/i.test(snapshot.collectionHash);
      const contentAvailable = placementContentAvailable(
        deployment.placementKey,
        deployment.scopeSlug,
        snapshot.entries.map((entry) => entry.slug),
      );
      return validHash && snapshot.buildId && contentAvailable
        ? ready('verifiedSnapshot', '位置内容来自可验证的当前公开快照')
        : blocked('verifiedSnapshot', '当前公开快照不含该位置可读内容或无法核验', [deployment.scopeSlug]);
    } catch {
      return blocked('verifiedSnapshot', '当前没有可读取的已核验公开快照');
    }
  }

  private async memberPermissionGate(deployment: DeploymentView): Promise<PublicReadinessGate> {
    const issues: string[] = [];
    if (deployment.members.length === 0) issues.push('没有部署成员');
    if (deployment.members.filter((member) => member.isDefault).length !== 1) issues.push('默认成员必须且只能有一个');

    for (const member of deployment.members) {
      const detail = await this.agents.detail(member.agentId).catch(() => null);
      const revision = detail?.revisions.find((item) => item.id === member.agentRevisionId);
      const label = `${detail?.name ?? member.agentId} v${member.revision}`;
      if (!detail || detail.archivedAt || !revision) {
        issues.push(`${label} 修订不可用`);
        continue;
      }
      if (revision.toolProfile.id !== READ_ONLY_PROFILE.id || revision.toolProfile.version !== READ_ONLY_PROFILE.version) {
        issues.push(`${label} 未使用当前只读工具配置`);
        continue;
      }
      const report = await this.releaseTests.report(member.agentId, member.agentRevisionId).catch(() => null);
      if (!report?.gate.ok) issues.push(`${label} 未通过最新三类权限测试`);
    }

    return issues.length === 0
      ? ready('memberPermissions', '所有部署成员都通过最新只读权限测试')
      : blocked('memberPermissions', '成员权限或测试证据尚未满足', issues);
  }

  /**
   * G03 资源门禁：目标机器（2C2G）要求至少 512MB 可用内存余量。
   * 不满足时**阻止该能力上线**（blocked），如实报告当前余量，绝不偷偷扩容或放宽阈值。
   */
  private resourceHeadroomGate(): PublicReadinessGate {
    const minMb = resolveMinFreeMemoryMb();
    const check = memoryHeadroomOk(os.freemem(), minMb * 1024 * 1024);
    return check.ok
      ? ready('resourceHeadroom', `本机可用内存 ${Math.floor(check.freeBytes / 1048576)}MB，满足 ${minMb}MB 要求`)
      : blocked('resourceHeadroom', check.reason);
  }

  private runtimeGate(): PublicReadinessGate {
    const report = readRuntimeProbe();
    if (runtimeProbePassed(report)) return ready('runtimeIsolation', '本机真实 SDK 探针取得回答并确认进程退出');
    const reason = !report
      ? '缺少运行隔离探针报告；请完成真实探针并配置 WALKER_RUNTIME_PROBE_REPORT'
      : report.local?.status !== 'pass'
        ? '最近运行隔离探针未通过；请检查脱敏报告后重跑 pnpm probe:runtime'
        : '探针未同时证明真实回答、无关闭错误和进程退出；请重跑 pnpm probe:runtime';
    return blocked('runtimeIsolation', reason);
  }

  private async retentionGate(): Promise<PublicReadinessGate> {
    try {
      const policy = await this.logs.getPolicy();
      const valid = Number.isInteger(policy.detailRetentionDays) && policy.detailRetentionDays >= 1 && policy.detailRetentionDays <= DEFAULT_DETAIL_RETENTION_DAYS &&
        Number.isInteger(policy.aggregateRetentionDays) && policy.aggregateRetentionDays >= 1 && policy.aggregateRetentionDays <= DEFAULT_AGGREGATE_RETENTION_DAYS;
      return valid
        ? ready('logRetention', `日志保留策略可读（明细 ${policy.detailRetentionDays} 天，聚合 ${policy.aggregateRetentionDays} 天）`)
        : blocked('logRetention', '日志保留期限不在允许范围');
    } catch {
      return blocked('logRetention', '无法读取日志保留策略');
    }
  }

  private async deletionGate(): Promise<PublicReadinessGate> {
    try {
      if (isRestoreGatePending(resolveRestoreGatePath())) return blocked('deletionRecovery', '恢复清理门仍处于挂起状态');
      await this.deletionReplay.assertRecoveryReady();
      const unfinished = await this.resources.unfinishedTombstones(1);
      return unfinished.length === 0
        ? ready('deletionRecovery', '删除清单已重放，当前没有未完成的会话删除')
        : blocked('deletionRecovery', '仍有未完成的会话删除任务');
    } catch {
      return blocked('deletionRecovery', '删除清单或恢复清理尚未完成');
    }
  }

  private routeGate(): PublicReadinessGate {
    const result = this.publicRoutes.check();
    return result.matches
      ? ready('publicRoutes', 'Nest 与当前工作区 Caddyfile 的方法/路径白名单一致', ['生产 Caddy 当前加载状态由 G08 核验'])
      : blocked('publicRoutes', 'Nest 与 Caddy 公网白名单不一致或 Caddyfile 不可读', [...result.missingFromCaddy, ...result.extraInCaddy]);
  }
}

function ready(key: PublicReadinessGateKey, reason: string, details: string[] = []): PublicReadinessGate {
  return { key, state: 'ready', reason, details };
}

function blocked(key: PublicReadinessGateKey, reason: string, details: string[] = []): PublicReadinessGate {
  return { key, state: 'blocked', reason, details };
}
