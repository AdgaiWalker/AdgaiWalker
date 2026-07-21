import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { MetricsService } from './metrics.service';

@Controller('metrics')
@UseGuards(AdminAuthGuard)
export class MetricsController {
  constructor(@Inject(MetricsService) private readonly metrics: MetricsService) {}

  @Get()
  summary() {
    return this.metrics.summary();
  }
}
