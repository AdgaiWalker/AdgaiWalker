import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { KernelModule } from './kernel.module';

@Module({
  imports: [ConfigModule, KernelModule, HealthModule],
})
export class AppModule {}
