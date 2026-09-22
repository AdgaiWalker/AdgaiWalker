import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  judgeReleaseTest, releaseGate, releaseTestPrompt, RELEASE_TEST_CASES, RELEASE_TEST_SUITE_VERSION,
  type ReleaseTestCase, type ReleaseTestEvidence,
} from '@walker/shared';
import { AuthorizationService } from '../authorization/authorization.service';
import { ApiError } from '../common/http-error';
import { AGENT_REVISION_REPOSITORY, type AgentRevisionRepositoryPort } from '../ports/agent-revision.repository';
import { AGENT_EXECUTION_REPOSITORY, type AgentExecutionRepositoryPort } from '../ports/agent-execution.repository';
import { AgentExecutionService } from './agent-execution.service';

@Injectable()
export class ReleaseTestService {
  constructor(
    @Inject(AGENT_REVISION_REPOSITORY) private readonly agents: AgentRevisionRepositoryPort,
    @Inject(AGENT_EXECUTION_REPOSITORY) private readonly runs: AgentExecutionRepositoryPort,
    @Inject(AuthorizationService) private readonly grants: AuthorizationService,
    @Inject(AgentExecutionService) private readonly execution: AgentExecutionService,
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
      const finished = await this.wait(accepted.id);
      const events = await this.runs.listEvents(accepted.id, 0, 20);
      const text = events.filter((event) => event.kind === 'text').map((event) => event.text ?? '').join('');
      await this.runs.markTest(accepted.id, {
        testCaseId, suiteVersion: RELEASE_TEST_SUITE_VERSION, configHash: revision.configHash,
        assertion: judgeReleaseTest(testCaseId, { state: finished?.state ?? 'UNKNOWN', text: text || null }),
      });
    }
    return this.report(agentId, revisionId);
  }

  async report(agentId: string, revisionId: string) {
    const revision = await this.revision(agentId, revisionId);
    const results = await this.evidence(revisionId);
    return { configHash: revision.configHash, suiteVersion: RELEASE_TEST_SUITE_VERSION, results, gate: releaseGate({ configHash: revision.configHash, results }) };
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

  private async evidence(revisionId: string): Promise<ReleaseTestEvidence[]> {
    const rows = await this.runs.listTests(revisionId);
    return rows.flatMap((row) => {
      if (!row.testCaseId || !RELEASE_TEST_CASES.includes(row.testCaseId as ReleaseTestCase) || row.suiteVersion === null || !row.configHash || !row.assertion) return [];
      return [{ testCaseId: row.testCaseId as ReleaseTestCase, suiteVersion: row.suiteVersion, configHash: row.configHash, assertion: row.assertion }];
    });
  }

  private async wait(id: string) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const run = await this.runs.findById(id);
      if (run && ['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN'].includes(run.state)) return run;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return this.runs.findById(id);
  }
}
