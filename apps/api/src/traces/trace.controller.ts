/**
 * 轨迹读取 HTTP 薄层（TECH-DESIGN §6.2）
 * GET /runs/:runId/trace            — 默认尾部 500 行（既有语义）
 * GET /runs/:runId/trace?after=&limit= — 游标增量续拉（新增可选参数，向后兼容）
 * 路径不带 api/ 前缀（生产 Caddy 与开发 vite 都会剥掉 /api）。
 */
import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { validationError } from '../common/http-error';
import { TraceService } from './trace.service';

/** 解析游标：给了就必须是 ≥0 的整数，非法即拒（不静默退回尾部，免得假装增量） */
function parseAfter(raw?: string): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw validationError('invalid-after');
  return n;
}

function parseLimit(raw?: string): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw validationError('invalid-limit');
  return n;
}

@Controller()
export class TraceController {
  constructor(
    @Inject(TraceService) private readonly traces: TraceService,
  ) {}

  @Get('runs/:runId/trace')
  getRunTrace(
    @Param('runId') runId: string,
    @Query('after') after?: string,
    @Query('limit') limit?: string,
  ) {
    return this.traces.getRunTrace(runId, {
      after: parseAfter(after),
      limit: parseLimit(limit),
    });
  }
}
