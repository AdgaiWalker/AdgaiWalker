import { Body, Controller, Delete, Get, Inject, Param, Post, Put } from '@nestjs/common';
import { MODEL_PROVIDER_PRESETS } from '@walker/shared';
import { ModelProviderService } from './model-provider.service';

@Controller('model-providers')
export class ModelProviderController {
  constructor(@Inject(ModelProviderService) private readonly service: ModelProviderService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(
    @Body()
    body: {
      id: string;
      name: string;
      baseUrl: string;
      apiFormat?: string;
      apiKey?: string;
      modelsJson?: string;
    },
  ) {
    return this.service.upsert(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name: string;
      baseUrl: string;
      apiFormat?: string;
      apiKey?: string;
      modelsJson?: string;
      enabled?: boolean;
    },
  ) {
    return this.service.upsert({ ...body, id });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { ok: true };
  }

  /** 内置供应商预设（IDE 式添加：选预设 → 只填 Key） */
  @Get('presets')
  presets() {
    return { presets: MODEL_PROVIDER_PRESETS };
  }

  @Get(':id/remote-models')
  async remoteModels(@Param('id') id: string) {
    return this.service.remoteModels(id);
  }

  /** 三档验证：连通 → 鉴权 → 能力（body.modelId 缺省用目录第一个） */
  @Post(':id/verify')
  verify(@Param('id') id: string, @Body() body: { modelId?: string }) {
    return this.service.verify(id, body.modelId);
  }

  @Post(':id/ping')
  ping(@Param('id') id: string) {
    return this.service.ping(id);
  }
}
