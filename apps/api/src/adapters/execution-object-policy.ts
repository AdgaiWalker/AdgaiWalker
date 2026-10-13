import { Inject, Injectable, Optional } from '@nestjs/common';
import type { AgentAction, ResourceScope } from '@walker/shared';
import { PUBLIC_SITE_SCOPE } from '@walker/shared';
import { SITE_CONTENT_INDEX, type SiteContentIndexPort } from '../ports/site-content-index.port';
import { CONTENT_FILE_REPOSITORY, type ContentFileRepositoryPort } from '../ports/content-file.repository';
import type { ExecutionObjectPolicyPort } from '../ports/execution-object-policy.port';

@Injectable()
export class ExecutionObjectPolicy implements ExecutionObjectPolicyPort {
  constructor(
    @Inject(SITE_CONTENT_INDEX) private readonly content: SiteContentIndexPort,
    @Optional() @Inject(CONTENT_FILE_REPOSITORY) private readonly files?: ContentFileRepositoryPort,
  ) {}

  async actions(kind: ResourceScope['kind'], id: string, agentId: string): Promise<readonly AgentAction[]> {
    if (kind === 'agent') return id === agentId ? ['agent:run'] : [];
    if (kind === 'content') {
      const citable = await this.content.loadCitable().catch(() => []);
      if (id === PUBLIC_SITE_SCOPE) return citable.length > 0 ? ['agent:run', 'content:read'] : [];
      if (citable.some((row) => row.slug === id)) return ['agent:run', 'content:read'];
      const file = await this.files?.get(id).catch(() => null);
      if (file) return ['agent:run', 'content:read'];
    }
    return [];
  }
}
