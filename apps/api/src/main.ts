import 'reflect-metadata';
import type { NextFunction, Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EnvConfigAdapter } from './config/env-config.adapter';
import { RequestIdMiddleware } from './observability/request-id.middleware';

async function bootstrap() {
  const config = new EnvConfigAdapter();
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const requestId = new RequestIdMiddleware();
  app.use((req: Request, res: Response, next: NextFunction) =>
    requestId.use(req, res, next),
  );
  const port = config.getPort();
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'api_started',
      port,
      aiEnabled: config.isAiEnabled(),
    }),
  );
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'api_boot_failed',
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
