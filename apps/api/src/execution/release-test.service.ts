import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  judgeReleaseTest, releaseGate, releaseTestPrompt, RELEASE_TEST_CASES, RELEASE_TEST_SUITE_VERSION,
  type ReleaseTestCase, type ReleaseTestEvidence,
} from '@walker/shared';
import { AuthorizationService } from '../authorization/authorization.service';
import { ApiError } from '../common/http-error';
import { AGENT_REVISION_REPOSITORY, type AgentRevisionRepositoryPort } from '../ports/agent-revision.repository';
import { AGENT_EXECUTION_REPOSITORY, type AgentExecutionRepositoryPort } from '../ports/agent-execution.repository';
import { AgentExecutionService } from './agent-execution.service';
import { MODEL_DIRECTORY, type ModelDirectoryPort } from '../ports/model-directory.port';
import { resolveHarnessConfiguration } from '../runtime/harness-launch';
import { readCredential } from '../runtime/dsh-credentials-file';

const environmentCredentialEpoch = randomUUID();

function fileRevision(home: string): string {
  try {
    const stat = fs.statSync(path.join(home, 'credentials.env'));
    return `${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}`;
  } catch { return 'missing'; }
}

@Injectable()
export class ReleaseTestService {
  constructor(
    @Inject(AGENT_REVISION_REPOSITORY) private readonly agents: AgentRevisionRepositoryPort,
    @Inject(AGENT_EXECUTION_REPOSITORY) private readonly runs: AgentExecutionRepositoryPort,
    @Inject(AuthorizationService) private readonly grants: AuthorizationService,
    @Inject(AgentExecutionService) private readonly execution: AgentExecutionService,
    @Inject(MODEL_DIRECTORY) private readonly directory: ModelDirectoryPort,
  ) {}

  async run(agentId: string, revisionId: string) {
    const revision = await this.revision(agentId, revisionId);
    const grant = await this.grants.issue({
      requestKey: 'suite' + randomUUID().replace(/-/g, '').slice(0, 12),
      level: 'L0', agentId, actions: ['agent:run'],
      resourceScope: { kind: 'agent', ids: [agentId] },
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      runLimit: RELEASE_TEST_CASES.length, usageLimit: 3000,
    }, 'owner');
    for (const testCaseId of RELEASE_TEST_CASES) {
      const accepted = await this.execution.accept({
        idempotencyKey: 'case' + randomUUID().replace(/-/g, '').slice(0, 16),
        kind: 'test', agentRevisionId: revisionId, input: releaseTestPrompt(testCaseId), grantId: grant.id,
      });
      // 等待与取文本各只有一份实现（AgentExecutionService）：这套流程原来自己拍窗口，
      // 拍短了会把「答得慢」判成 review，与闸门判据打架。
      const finished = await this.execution.awaitTerminal(accepted.id);
      const text = await this.execution.savedText(accepted.id);
      await this.runs.markTest(accepted.id, {
        testCaseId, suiteVersion: RELEASE_TEST_SUITE_VERSION, configHash: this.effectiveHash(agentId, revision),
        assertion: judgeReleaseTest(testCaseId, { state: finished?.state ?? 'UNKNOWN', text: text || null }),
      });
    }
    return this.report(agentId, revisionId);
  }

  async report(agentId: string, revisionId: string) {
    const revision = await this.revision(agentId, revisionId);
    const results = await this.evidence(revisionId);
    const configHash = this.effectiveHash(agentId, revision);
    return { configHash, suiteVersion: RELEASE_TEST_SUITE_VERSION, results, gate: releaseGate({ configHash, results }) };
  }

  private effectiveHash(agentId: string, revision: { configHash: string; providerId: string | null; modelId: string }): string {
    const config = resolveHarnessConfiguration(
      { audience: 'admin', modelDirectory: this.directory }, agentId,
      { providerId: revision.providerId, modelId: revision.modelId },
    );
    const ref = config.facts.apiKeyRef;
    const credentialRevision = config.ownHome && readCredential(config.ownHome, ref)
      ? `agent:${fileRevision(config.ownHome)}`
      : process.env[ref]
        ? `environment:${environmentCredentialEpoch}`
        : config.credential
          ? `shared:${fileRevision(this.directory.homeDir())}`
          : 'none';
    return createHash('sha256').update(JSON.stringify({
      revision: revision.configHash, provider: config.providerId, model: config.model,
      facts: config.facts, credentialRevision,
    })).digest('hex');
  }

  async refuseDeploy(agentId: string, revisionId: string) {
    const report = await this.report(agentId, revisionId);
    if (!report.gate.ok) throw new ApiError('release-test-failed', 403, report.gate.reason);
    throw new ApiError('not-connected', 501, '测试已通过，但部署尚未接通');
  }

  private async revision(agentId: string, revisionId: string) {
    const detail = await this.agents.detail(agentId);
    const revision = detail?.revisions.find((item) => item.id === revisionId);
    if (!detail || detail.archivedAt || !revision) throw new ApiError('execution-denied', 403, '当前修订不能测试');
    return revision;
  }

  /**
   * 取每个用例**最新一次**的结果。
   *
   * `listTests` 按 createdAt 倒序返回该修订的**全部**历史测试运行——每跑一次套件就多 3 行。
   * 原先这里直接把所有行铺开，于是重跑之后同一个用例出现多次：
   *   ① UI 报 React 重复 key（同一列表里重复子项，行为未定义）；
   *   ② 用户看到 6 条结果，无法判断哪条才算数。
   * `releaseGate` 用 `.find()` 取第一条（即最新），所以闸门其实一直是对的——
   * 也就是说「闸门判据」和「界面展示」对同一份数据给了两个答案。这里统一成最新优先。
   */
  private async evidence(revisionId: string): Promise<ReleaseTestEvidence[]> {
    const rows = await this.runs.listTests(revisionId);
    const latest = new Map<ReleaseTestCase, ReleaseTestEvidence>();
    for (const row of rows) {
      if (!row.testCaseId || !RELEASE_TEST_CASES.includes(row.testCaseId as ReleaseTestCase)) continue;
      if (row.suiteVersion === null || !row.configHash || !row.assertion) continue;
      const testCaseId = row.testCaseId as ReleaseTestCase;
      // rows 已按 createdAt 倒序：首个命中的就是最新，后续旧结果直接丢弃。
      if (latest.has(testCaseId)) continue;
      latest.set(testCaseId, { testCaseId, suiteVersion: row.suiteVersion, configHash: row.configHash, assertion: row.assertion });
    }
    // 按套件定义的固定顺序返回，界面顺序稳定（也便于与闸门逐项对照）。
    return RELEASE_TEST_CASES.flatMap((testCaseId) => {
      const item = latest.get(testCaseId);
      return item ? [item] : [];
    });
  }

}
