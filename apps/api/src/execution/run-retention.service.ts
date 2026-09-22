import { Inject, Injectable } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { AGENT_EXECUTION_REPOSITORY, type AgentExecutionRepositoryPort } from '../ports/agent-execution.repository';

const DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class RunRetentionService {
  constructor(@Inject(AGENT_EXECUTION_REPOSITORY) private readonly runs: AgentExecutionRepositoryPort) {}

  async markAdmin(runId: string, now = new Date()) {
    await this.runs.markRetention(runId, {
      retainUntil: new Date(now.getTime() + 7 * DAY),
      diagnosticName: `run-${runId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}.log`,
    });
  }

  async cleanup(runsDir: string, now = new Date()) {
    const root = path.resolve(runsDir);
    const expired = await this.runs.listExpiredAdmin(now);
    const removed: Array<{ id: string; diagnosticName: string | null }> = [];
    for (const item of expired) {
      const deleted = await this.runs.deleteExpiredAdmin(item.id, now);
      if (!deleted) continue;
      this.removeDiagnostic(root, item.diagnosticName);
      removed.push({ id: item.id, diagnosticName: item.diagnosticName });
    }
    return { removed };
  }

  private removeDiagnostic(root: string, name: string | null) {
    if (!name || !/^[a-zA-Z0-9._-]{1,80}$/.test(name) || name.includes('..')) return;
    const target = path.resolve(root, name);
    if (path.dirname(target) !== root) return;
    fs.rmSync(target, { force: true });
  }
}
