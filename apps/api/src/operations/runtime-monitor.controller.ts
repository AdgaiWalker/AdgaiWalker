import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  RUNTIME_LOG_PAGE_LIMIT_MAX,
  RUNTIME_REQUEST_PAGE_LIMIT_MAX,
  isRuntimeLogChannel,
  parseRuntimeFlag,
  parseRuntimePageLimit,
  type RuntimeLogChannel,
} from '@walker/shared';
import { validationError } from '../common/http-error';
import {
  RUNTIME_LOG_BUFFER,
  RUNTIME_REQUEST_BUFFER,
  type RuntimeLogBufferPort,
  type RuntimeRequestBufferPort,
} from '../ports/runtime-monitor.port';

/**
 * 本地开发运行监控（只读三个端点，管理鉴权内，不进公网白名单）。
 *
 * 三条边界：
 * - **只读**：这里没有写入口。日志与指标由进程内采集器写入，HTTP 只查询。
 * - **服务端过滤**：channel / errorsOnly 都在服务端生效，前端不做任何本地回退——
 *   面板那次"筛选为空退回未筛选数据，管理员据此查错人"的事故从结构上不会重演。
 * - **参数非法就拒**：limit 越界或 channel 不认识都返回 400，不静默兜成默认值
 *   （否则界面会拿着"我以为的筛选"看"别人的数据"）。
 */
@Controller('ops/runtime')
export class RuntimeMonitorController {
  constructor(
    @Inject(RUNTIME_LOG_BUFFER) private readonly logs: RuntimeLogBufferPort,
    @Inject(RUNTIME_REQUEST_BUFFER) private readonly requests: RuntimeRequestBufferPort,
  ) {}

  @Get('metrics')
  metrics() {
    return this.requests.snapshot(new Date(), this.logs.dropped());
  }

  @Get('requests')
  listRequests(
    @Query('limit') rawLimit?: string,
    @Query('errorsOnly') rawErrorsOnly?: string,
    @Query('humanOnly') rawHumanOnly?: string,
  ) {
    const limit = parseRuntimePageLimit(rawLimit, RUNTIME_REQUEST_PAGE_LIMIT_MAX);
    if (limit === null) throw validationError('limit 参数不正确');
    return this.requests.page({
      limit,
      errorsOnly: parseRuntimeFlag(rawErrorsOnly),
      humanOnly: parseRuntimeFlag(rawHumanOnly),
    });
  }

  @Get('logs')
  listLogs(
    @Query('limit') rawLimit?: string,
    @Query('ch') rawChannel?: string,
    @Query('errorsOnly') rawErrorsOnly?: string,
  ) {
    const limit = parseRuntimePageLimit(rawLimit, RUNTIME_LOG_PAGE_LIMIT_MAX);
    if (limit === null) throw validationError('limit 参数不正确');
    if (rawChannel !== undefined && rawChannel !== '' && !isRuntimeLogChannel(rawChannel)) {
      throw validationError('ch 参数不正确');
    }
    const channel: RuntimeLogChannel | undefined =
      rawChannel && isRuntimeLogChannel(rawChannel) ? rawChannel : undefined;
    return this.logs.page({ limit, channel, errorsOnly: parseRuntimeFlag(rawErrorsOnly) });
  }
}
