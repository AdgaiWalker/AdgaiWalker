import { Inject, Injectable } from '@nestjs/common';
import type { AgentAction, ResourceScope } from '@walker/shared';
import { SITE_CONTENT_INDEX, type SiteContentIndexPort } from '../ports/site-content-index.port';
import type { ExecutionObjectPolicyPort } from '../ports/execution-object-policy.port';
@Injectable()
export class ExecutionObjectPolicy implements ExecutionObjectPolicyPort {
  constructor(@Inject(SITE_CONTENT_INDEX) private readonly content: SiteContentIndexPort) {}
  async actions(kind: ResourceScope['kind'], id: string, agentId: string): Promise<readonly AgentAction[]> {
    if (kind === 'agent') return id === agentId ? ['agent:run'] : [];
    if (kind === 'content' && (await this.content.loadCitable()).some((row) => row.slug === id)) return ['agent:run', 'content:read'];
    return [];
  }
}
