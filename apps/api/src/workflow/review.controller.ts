import { Body, Controller, Inject, Param, Post } from '@nestjs/common';
import type { ProductionStage } from '@walker/shared';
import { ReviewService } from './review.service';

@Controller('works')
export class ReviewController {
  constructor(@Inject(ReviewService) private readonly review: ReviewService) {}

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() body: { artifactHash?: string }) { return this.review.approve(id, body.artifactHash ?? ''); }

  @Post(':id/return')
  returnForChanges(@Param('id') id: string) { return this.review.returnForChanges(id); }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) { return this.review.cancel(id); }

  @Post(':id/recover')
  recover(@Param('id') id: string, @Body() body: { stage?: ProductionStage }) { return this.review.recover(id, body.stage ?? 'REVIEW_READY'); }
}
