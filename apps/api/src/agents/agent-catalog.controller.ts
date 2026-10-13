import { Body, Controller, Get, Inject, Param, Post, Put } from '@nestjs/common';
import { AgentCatalogService } from './agent-catalog.service';
import { AgentModelConfigService } from './agent-model-config.service';
import { validationError } from '../common/http-error';
import type { AgentModelConfigInput } from '@walker/shared';

/** origin/actor 不从 body 接收；本控制器仅在现有管理鉴权之后可达。 */
@Controller('ops')
export class AgentCatalogController {
  constructor(
    @Inject(AgentCatalogService) private readonly catalog: AgentCatalogService,
    @Inject(AgentModelConfigService) private readonly modelConfig: AgentModelConfigService,
  ) {}
  @Get('agent-models') models() { return this.catalog.models(); }
  @Post('agents') create(@Body() body: unknown) { return this.catalog.save(null, body, 'owner'); }
  @Post('agents/import-legacy') async importLegacy() { return { imported: await this.catalog.importLegacy('owner') }; }
  @Get('agents/:id') detail(@Param('id') id: string) { return this.catalog.detail(id); }

  /** 该 Agent 自己的模型与凭据配置（独立配置，可选回落全局）。响应绝不含凭据值。 */
  @Get('agents/:id/model-config')
  modelConfigView(@Param('id') id: string) { return this.modelConfig.read(id); }

  /** 保存该 Agent 自己的模型与凭据；只写它自己的 home，不触碰共享层。 */
  @Put('agents/:id/model-config')
  saveModelConfig(@Param('id') id: string, @Body() body: unknown) {
    return this.modelConfig.save(id, parseAgentModelConfigInput(body));
  }

  @Post('agents/:id/revisions') revise(@Param('id') id: string, @Body() body: unknown) { return this.catalog.save(id, body, 'owner'); }
  @Post('agents/:id/archive') async archive(@Param('id') id: string) { await this.catalog.archive(id, 'owner'); return { archived: true }; }
  @Post('agents/:id/import-skill/:skillId') importSkill(@Param('id') id: string, @Param('skillId') skillId: string, @Body() body: unknown) {
    return this.catalog.importSkill(id, skillId, body, 'owner');
  }
  @Get('agents/:id/revisions/:revisionId/export') export(@Param('id') id: string, @Param('revisionId') revisionId: string) {
    return this.catalog.exportRevision(id, revisionId);
  }
}

/**
 * 解析 Agent 模型配置的请求体：**拒绝未知字段**（与修订接口同一纪律），
 * 只做形状校验；语义校验（提供方是否在目录、引用名形态）在 service 里 fail-closed。
 */
function parseAgentModelConfigInput(value: unknown): AgentModelConfigInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw validationError('请求体必须是对象');
  }
  const body = value as Record<string, unknown>;
  const allowed = ['providerId', 'modelId', 'modelName', 'apiKey', 'apiKeyRef'];
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length) throw validationError(`包含未知字段：${unknown.join('、')}`);

  const out: AgentModelConfigInput = {};
  if ('providerId' in body) {
    if (body.providerId !== null && typeof body.providerId !== 'string') {
      throw validationError('providerId 必须是字符串或 null');
    }
    out.providerId = body.providerId as string | null;
  }
  if ('modelId' in body) {
    if (typeof body.modelId !== 'string') throw validationError('modelId 必须是字符串');
    out.modelId = body.modelId;
  }
  if ('modelName' in body) {
    if (typeof body.modelName !== 'string') throw validationError('modelName 必须是字符串');
    out.modelName = body.modelName;
  }
  // apiKey：null = 删除；字符串（含空串）= 有值才更新。
  if ('apiKey' in body) {
    if (body.apiKey !== null && typeof body.apiKey !== 'string') {
      throw validationError('apiKey 必须是字符串或 null');
    }
    out.apiKey = body.apiKey as string | null;
  }
  if ('apiKeyRef' in body) {
    if (typeof body.apiKeyRef !== 'string') throw validationError('apiKeyRef 必须是字符串');
    out.apiKeyRef = body.apiKeyRef;
  }
  return out;
}
