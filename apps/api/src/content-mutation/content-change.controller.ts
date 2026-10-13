import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { validationError } from '../common/http-error';
import { newId } from '../common/ids';
import { CONTENT_MUTATION_SERVICE, type ContentMutationPort } from '../ports/content-mutation.port';
import { CONTENT_CHANGE_REPOSITORY, type ContentChangeRepositoryPort } from '../ports/content-change.repository';
import { CANDIDATE_FILE_REPOSITORY, type CandidateFileRepositoryPort } from '../ports/candidate-file.repository';

@Controller('ops/content-changes')
export class ContentChangeController {
  constructor(
    @Inject(CONTENT_MUTATION_SERVICE) private readonly mutation: ContentMutationPort,
    @Inject(CONTENT_CHANGE_REPOSITORY) private readonly changes: ContentChangeRepositoryPort,
    @Inject(CANDIDATE_FILE_REPOSITORY) private readonly candidateFiles: CandidateFileRepositoryPort,
  ) {}

  @Post()
  async propose(@Body() body: Record<string, unknown>) {
    if (!body || typeof body !== 'object') throw validationError('请求体无效');
    const { slug, agentId, instruction, grantId, requestKey } = body;
    if (
      typeof slug !== 'string' ||
      typeof agentId !== 'string' ||
      typeof instruction !== 'string' ||
      typeof grantId !== 'string'
    ) {
      throw validationError('参数 slug, agentId, instruction, grantId 均为必需字符串');
    }
    return this.mutation.propose({
      slug,
      agentId,
      instruction,
      grantId,
      requestKey: typeof requestKey === 'string' && requestKey ? requestKey : newId(),
      actor: 'owner',
    });
  }

  @Get()
  async list(@Query('slug') slug?: string, @Query('limit') limit?: string) {
    const items = await this.changes.list({
      slug: slug || undefined,
      limit: limit ? Number(limit) : undefined,
    });
    const enriched = await Promise.all(
      items.map(async (item) => {
        const candFile = await this.candidateFiles.read(item.candidateRef).catch(() => null);
        return {
          ...item,
          candidateRaw: candFile?.raw ?? null,
        };
      }),
    );
    return { items: enriched };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const item = await this.changes.findById(id);
    if (!item) throw validationError('找不到该候选记录');
    const candFile = await this.candidateFiles.read(item.candidateRef).catch(() => null);
    return {
      ...item,
      candidateRaw: candFile?.raw ?? null,
    };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    if (!body || typeof body !== 'object' || typeof body.grantId !== 'string') {
      throw validationError('参数 grantId 为必需字符串');
    }
    return this.mutation.approve({
      changeId: id,
      grantId: body.grantId,
      actor: 'owner',
    });
  }

  @Post(':id/apply')
  @HttpCode(HttpStatus.OK)
  async apply(@Param('id') id: string, @Body() body?: Record<string, unknown>) {
    return this.mutation.apply({
      changeId: id,
      actor: 'owner',
      requestId: typeof body?.requestId === 'string' && body.requestId ? body.requestId : newId(),
    });
  }
}
