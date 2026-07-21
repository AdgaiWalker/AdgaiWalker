import { Module } from '@nestjs/common';
import { KernelModule } from '../kernel.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [KernelModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
