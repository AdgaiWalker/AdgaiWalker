/**
 * 轨迹读取用例层（TECH-DESIGN §6.1）
 * 职责：把「运行 id + 可选游标」翻译成仓储读取；不存在即 404（诚实：不返回空列表冒充）
 */
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../common/http-error';
import {
  TRACE_REPOSITORY,
  type TraceRepositoryPort,
  type TraceReadOptions,
  type TraceReadResult,
} from '../ports/trace.repository';

@Injectable()
export class TraceService {
  constructor(
    @Inject(TRACE_REPOSITORY) private readonly traces: TraceRepositoryPort,
  ) {}

  /** 读取运行轨迹：默认尾部 500 行；给 after 则只回该游标之后的增量（含诚实截断标记） */
  async getRunTrace(
    runId: string,
    options?: TraceReadOptions,
  ): Promise<TraceReadResult> {
    const result = await this.traces.readEvents(runId, options);
    if (!result) {
      throw new ApiError(
        'trace-not-found',
        HttpStatus.NOT_FOUND,
        '未找到该运行的轨迹日志',
      );
    }
    return result;
  }
}
