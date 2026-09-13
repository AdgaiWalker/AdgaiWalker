import { Body, Controller, Delete, Get, Inject, Param, Post, Put } from '@nestjs/common';
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

  @Post(':id/ping')
  ping(@Param('id') id: string) {
    return this.service.ping(id);
  }
}
