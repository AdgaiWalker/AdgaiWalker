import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { AgentCatalogService } from './agent-catalog.service';

/** origin/actor 不从 body 接收；本控制器仅在现有管理鉴权之后可达。 */
@Controller('ops')
export class AgentCatalogController {
  constructor(@Inject(AgentCatalogService) private readonly catalog: AgentCatalogService) {}
  @Get('agent-models') models() { return this.catalog.models(); }
  @Post('agents') create(@Body() body: unknown) { return this.catalog.save(null, body, 'owner'); }
  @Post('agents/import-legacy') async importLegacy() { return { imported: await this.catalog.importLegacy('owner') }; }
  @Get('agents/:id') detail(@Param('id') id: string) { return this.catalog.detail(id); }
  @Post('agents/:id/revisions') revise(@Param('id') id: string, @Body() body: unknown) { return this.catalog.save(id, body, 'owner'); }
  @Post('agents/:id/archive') async archive(@Param('id') id: string) { await this.catalog.archive(id, 'owner'); return { archived: true }; }
  @Post('agents/:id/import-skill/:skillId') importSkill(@Param('id') id: string, @Param('skillId') skillId: string, @Body() body: unknown) {
    return this.catalog.importSkill(id, skillId, body, 'owner');
  }
  @Get('agents/:id/revisions/:revisionId/export') export(@Param('id') id: string, @Param('revisionId') revisionId: string) {
    return this.catalog.exportRevision(id, revisionId);
  }
}
