import { Body, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import {
  RUNTIME_LOG_PAGE_LIMIT_MAX,
  RUNTIME_REQUEST_PAGE_LIMIT_MAX,
  formatAdminUiEventLine,
  isAdminUiEventName,
  isRuntimeLogChannel,
  parseRuntimeFlag,
  parseRuntimePageLimit,
  prepareRuntimeLogEntry,
  redactSensitive,
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
 * 本地开发运行监控（管理鉴权内，不进公网白名单）。
 *
 * 边界：
 * - 查询端点只读；`POST /ops/runtime/ui-events` 仅接收白名单内 8 个轻量 UI 交互埋点，
 *   fail-open 写入进程内日志缓冲与 stdout，零 SQLite 迁移。
 * - **服务端过滤**：channel / errorsOnly 都在服务端生效，前端不做任何本地回退。
 * - **参数非法就拒**：limit 越界、channel 或 event 不认识都返回 400，不静默兜成默认值。
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

  @Post('ui-events')
  @HttpCode(200)
  recordUiEvent(@Body() body?: Record<string, unknown>) {
    const event = body?.event;
    if (!isAdminUiEventName(event)) throw validationError('event 参数不正确');
    const props =
      body?.props && typeof body.props === 'object' && !Array.isArray(body.props)
        ? (body.props as Record<string, unknown>)
        : undefined;
    const text = formatAdminUiEventLine(event, props);
    const entry = prepareRuntimeLogEntry({
      ts: new Date(),
      context: 'AdminUiTelemetry',
      level: event === 'ai.silent_degraded' ? 'warn' : 'info',
      text,
      redact: redactSensitive,
    });
    try {
      this.logs.append(entry);
    } catch {
      // fail-open：埋点写入失败绝不影响响应
    }
    try {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ level: entry.level, msg: 'admin_ui_event', event, text: entry.text }));
    } catch {
      // 终端输出异常忽略
    }
    return { ok: true };
  }
}
