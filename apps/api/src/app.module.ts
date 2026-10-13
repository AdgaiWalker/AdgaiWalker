import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AdminTokenMiddleware } from './auth/admin-token.middleware';
import { AdminRequestLogMiddleware } from './auth/admin-request-log.middleware';
import { SameOriginMiddleware } from './auth/same-origin.middleware';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { KernelModule } from './kernel.module';
import { WorkstationModule } from './workstation/workstation.module';
import { PUBLIC_ROUTE_EXCLUSIONS } from './auth/public-route-contract';

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
    // 全部变更方法先过 CSRF Origin 校验；非浏览器服务器调用无 Origin 时可继续。
    consumer.apply(SameOriginMiddleware).forRoutes('*');
    consumer
      .apply(AdminTokenMiddleware)
      .exclude(...PUBLIC_ROUTE_EXCLUSIONS)
      .forRoutes('*');
    consumer
      .apply(AdminRequestLogMiddleware)
      .exclude(...PUBLIC_ROUTE_EXCLUSIONS)
      .forRoutes('*');
  }
}
