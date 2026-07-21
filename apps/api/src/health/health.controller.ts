import { Controller, Get, Inject } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(
    /** tsx 运行期无 emitDecoratorMetadata，构造注入必须显式 @Inject */
    @Inject(HealthService) private readonly health: HealthService,
  ) {}

  @Get('health')
  async healthCheck() {
    return this.health.getHealth();
  }
}
