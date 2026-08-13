import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { PublicationService } from './publication.service';

@Controller('works')
export class PublicationController {
  constructor(@Inject(PublicationService) private readonly publications: PublicationService) {}

  @Get(':id/publications')
  list(@Param('id') id: string) { return this.publications.list(id); }

  @Post(':id/publish/website')
  publishWebsite(@Param('id') id: string, @Body() body: { artifactHash?: string }) { return this.publications.publishWebsite(id, body.artifactHash ?? ''); }

  @Post(':id/publish/website/verify')
  verifyWebsite(@Param('id') id: string) { return this.publications.verifyWebsite(id); }

  @Post(':id/publish/wechat-draft')
  prepareWechat(@Param('id') id: string, @Body() body: { artifactHash?: string }) { return this.publications.prepareWechat(id, body.artifactHash ?? ''); }
}
