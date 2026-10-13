import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { parseGeneration } from '@walker/shared';
import { ApiError } from '../common/http-error';
import { DeploymentService } from './deployment.service';
import { PublicReadinessService } from './public-readiness.service';

/** origin/actor 不从 body 接收：管理面 actor 固定为站主。 */
@Controller('ops/deployments')
export class DeploymentController {
  constructor(
    @Inject(DeploymentService) private readonly service: DeploymentService,
    @Inject(PublicReadinessService) private readonly readiness: PublicReadinessService,
  ) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get('resolve/:placementKey/:scopeSlug')
  async resolve(@Param('placementKey') placementKey: string, @Param('scopeSlug') scopeSlug: string) {
    const found = await this.service.resolve(placementKey, scopeSlug);
    if (!found) throw new ApiError('deployment-not-enabled', 404, '该位置没有启用的部署');
    return found;
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Get(':id/readiness')
  readinessReport(@Param('id') id: string) {
    return this.readiness.inspect(id);
  }

  @Post()
  save(@Body() body: unknown) {
    return this.service.save(body, 'owner');
  }

  @Post(':id/enable')
  enable(@Param('id') id: string, @Body() body: unknown) {
    return this.service.enable(id, parseGeneration(body), 'owner');
  }

  @Post(':id/disable')
  disable(@Param('id') id: string, @Body() body: unknown) {
    return this.service.disable(id, parseGeneration(body), 'owner');
  }

  @Post(':id/rollback')
  rollback(@Param('id') id: string, @Body() body: unknown) {
    return this.service.rollback(id, body, 'owner');
  }
}
