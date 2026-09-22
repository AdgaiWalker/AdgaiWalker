/**
 * 技能接口（管理面）：列出 / 执行 / 导出。
 *
 * 边界与 `/agents`、`/architecture` 同一条：站主工具，走管理凭据防线。
 * 导出里的端点地址默认取本次请求的来源（这样示例里的 URL 就是对方能访问到的地址），
 * 也可用 `?baseUrl=` 显式指定。
 */
import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { SkillService, type SkillExportBundle, type SkillRunAnswer } from './skill.service';

type RequestLike = {
  protocol?: string;
  headers?: Record<string, string | string[] | undefined>;
  get?: (name: string) => string | undefined;
};

function originOf(request: RequestLike, override?: string): string {
  const explicit = override?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const forwarded = request.headers?.['x-forwarded-host'];
  const host =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded) ??
    request.get?.('host') ??
    '127.0.0.1:8788';
  const proto = request.protocol ?? 'http';
  return `${proto}://${host}`;
}

@Controller('skills')
export class SkillController {
  constructor(@Inject(SkillService) private readonly skills: SkillService) {}

  @Get()
  list() {
    return this.skills.list();
  }

  /** 最近运行记录：技能有没有在被用、失败在哪个原因，一眼可见 */
  @Get(':id/runs')
  runs(@Param('id') id: string) {
    return this.skills.recentRuns(id);
  }

  /** 自检：逐条跑考题并按期望判分（cases.json 是技能的验收标准） */
  @Post(':id/selfcheck')
  selfcheck(@Param('id') id: string) {
    return this.skills.selfcheck(id);
  }

  @Get(':id/export')
  export(
    @Param('id') id: string,
    @Req() request: RequestLike,
    @Query('baseUrl') baseUrl?: string,
  ): Promise<SkillExportBundle> {
    return this.skills.exportBundle(id, originOf(request, baseUrl));
  }

  @Post(':id/run')
  run(
    @Param('id') id: string,
    @Body()
    body: {
      input?: string;
      sessionId?: string | null;
      providerId?: string | null;
      modelId?: string;
    },
  ): Promise<SkillRunAnswer> {
    return this.skills.run(id, {
      input: body.input ?? '',
      sessionId: body.sessionId ?? null,
      providerId: body.providerId ?? null,
      modelId: body.modelId,
    });
  }
}
