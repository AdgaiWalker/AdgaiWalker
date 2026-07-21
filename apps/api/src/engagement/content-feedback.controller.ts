import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ContentFeedbackService } from './content-feedback.service';

@Controller('content-feedback')
export class ContentFeedbackController {
  constructor(
    @Inject(ContentFeedbackService)
    private readonly feedback: ContentFeedbackService,
  ) {}

  @Post()
  submit(
    @Body() body: { contentId?: string; signal?: string; note?: string },
  ) {
    return this.feedback.submit({
      contentId: body.contentId ?? '',
      signal: body.signal ?? '',
      note: body.note,
    });
  }
}
