import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AdminTokenMiddleware } from './auth/admin-token.middleware';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { KernelModule } from './kernel.module';
import { WorkstationModule } from './workstation/workstation.module';

/**
 * 公共白名单：与 ops/windows/Caddyfile 公网站点逐条对齐（路径+方法）。
 * 白名单之外的所有路由都要求管理凭据（AdminTokenMiddleware）。
 * 修改任一侧时必须同步另一侧。
 */
@Module({
  imports: [ConfigModule, KernelModule, HealthModule, WorkstationModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AdminTokenMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.GET },
        { path: 'intake', method: RequestMethod.POST },
        { path: 'assistant', method: RequestMethod.POST },
        { path: 'likes', method: RequestMethod.GET },
        { path: 'likes', method: RequestMethod.POST },
        { path: 'content-feedback', method: RequestMethod.POST },
        { path: 'search-events', method: RequestMethod.POST },
        { path: 'support', method: RequestMethod.GET },
      )
      .forRoutes('*');
  }
}
