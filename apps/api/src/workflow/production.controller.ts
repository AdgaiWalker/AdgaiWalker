import { Body, Controller, Inject, Param, Post } from '@nestjs/common';
import { ProductionService } from './production.service';
import { WorkService } from '../work/work.service';
import type { ProductionStage, StageArtifact } from '@walker/shared';

@Controller('works')
export class ProductionController {
  constructor(
    @Inject(ProductionService) private readonly production: ProductionService,
    @Inject(WorkService) private readonly works: WorkService,
  ) {}

  @Post(':id/produce')
  async produce(@Param('id') id: string, @Body() body: { originalText?: string; fromStage?: ProductionStage }) {
    const originalText = body.originalText ?? await this.works.readOriginalText(id);
    return this.production.run(id, originalText, { fromStage: body.fromStage });
  }

  @Post(':id/artifacts')
  acceptManual(@Param('id') id: string, @Body() body: { artifact?: StageArtifact }) {
    return this.production.acceptManualArtifact(id, body.artifact as StageArtifact);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.production.cancel(id);
  }
}
