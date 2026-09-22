import { Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { ReleaseTestService } from './release-test.service';

/** 发布前测试。通过也不创建部署。 */
@Controller('ops/agents/:agentId/revisions/:revisionId')
export class ReleaseTestController {
  constructor(@Inject(ReleaseTestService) private readonly tests: ReleaseTestService) {}

  @Post('release-tests')
  run(@Param('agentId') agentId: string, @Param('revisionId') revisionId: string) {
    return this.tests.run(agentId, revisionId);
  }

  @Get('release-tests')
  report(@Param('agentId') agentId: string, @Param('revisionId') revisionId: string) {
    return this.tests.report(agentId, revisionId);
  }

  @Post('deploy')
  deploy(@Param('agentId') agentId: string, @Param('revisionId') revisionId: string) {
    return this.tests.refuseDeploy(agentId, revisionId);
  }
}
