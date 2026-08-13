import { Body, Controller, Inject, Param, Post } from '@nestjs/common';
import { ContentFeedbackService } from './content-feedback.service';

@Controller('content-feedback')
export class ContentFeedbackController {
  constructor(
    @Inject(ContentFeedbackService)
    private readonly feedback: ContentFeedbackService,
  ) {}

  @Post()
  submit(
    @Body() body: { contentId?: string; signal?: string; note?: string; source?: string },
  ) {
    return this.feedback.submit({
      contentId: body.contentId ?? '',
      signal: body.signal ?? '',
      note: body.note,
      source: body.source,
    });
  }

  @Post(':id/convert')
  convert(
    @Param('id') id: string,
    @Body() body: { target?: 'SEED' | 'ACTION'; confirmed?: boolean; title?: string; plannedDate?: string | null },
  ) {
    return this.feedback.convert(id, {
      target: body.target ?? 'SEED',
      confirmed: body.confirmed === true,
      title: body.title,
      plannedDate: body.plannedDate,
    });
  }
}
