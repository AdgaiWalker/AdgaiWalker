import { Global, Module } from '@nestjs/common';
import { APP_CONFIG } from './config.port';
import { EnvConfigAdapter } from './env-config.adapter';

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useClass: EnvConfigAdapter,
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
