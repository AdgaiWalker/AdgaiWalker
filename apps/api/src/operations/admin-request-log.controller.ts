import { Controller, Get, Inject, Query } from '@nestjs/common';
import { validationError } from '../common/http-error';
import { ADMIN_REQUEST_LOG, type AdminRequestLogPort } from '../ports/admin-request-log.port';

/** Authenticated backend HTTP timeline; no request or response payloads. */
@Controller('ops')
export class AdminRequestLogController {
  constructor(@Inject(ADMIN_REQUEST_LOG) private readonly log: AdminRequestLogPort) {}

  @Get('admin-log')
  async list(@Query('limit') rawLimit?: string, @Query('before') before?: string, @Query('method') method?: string) {
    const limit = rawLimit === undefined ? 50 : Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
        (before !== undefined && !/^[0-9a-f-]{36}$/i.test(before)) ||
        (method !== undefined && !['WRITE', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method))) {
      throw validationError('日志分页或方法参数不正确');
    }
    const items = await this.log.list({ limit, before, method });
    return { items, next: items.length === limit ? items.at(-1)!.id : null };
  }
}
