import { Body, Controller, Get, Inject, Post, Put } from '@nestjs/common';
import { validationError } from '../common/http-error';
import { ModelConfigService } from './model-config.service';

/** HTTP 薄层：协议进出 → 调用例，不写领域规则。 */
@Controller('ops/model-config')
export class ModelConfigController {
  constructor(@Inject(ModelConfigService) private readonly modelConfig: ModelConfigService) {}

  @Get()
  read() {
    return this.modelConfig.read();
  }

  @Put()
  save(@Body() body: unknown) {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw validationError('配置请求格式不正确');
    }
    const record = body as Record<string, unknown>;
    const allowed = ['providerId', 'baseURL', 'apiKey', 'models', 'protocol'];
    if (Object.keys(record).some((key) => !allowed.includes(key))) {
      throw validationError('请求包含未知字段');
    }
    if (typeof record.providerId !== 'string' || !record.providerId.trim()) {
      throw validationError('缺少提供方 id');
    }
    return this.modelConfig.save({
      providerId: record.providerId.trim(),
      baseURL: typeof record.baseURL === 'string' ? record.baseURL : '',
      apiKey: typeof record.apiKey === 'string' ? record.apiKey : null,
      models: Array.isArray(record.models)
        ? (record.models as { id: string; name: string }[])
        : undefined,
      // 协议要透传，否则 UI 选的协议永远写不进配置。
      protocol: typeof record.protocol === 'string' ? record.protocol : undefined,
    });
  }

  @Post('test')
  test(@Body() body: unknown) {
    const providerId =
      typeof body === 'object' && body !== null && typeof (body as Record<string, unknown>).providerId === 'string'
        ? ((body as Record<string, unknown>).providerId as string).trim()
        : '';
    if (!providerId) throw validationError('缺少提供方 id');
    return this.modelConfig.test(providerId);
  }
}
