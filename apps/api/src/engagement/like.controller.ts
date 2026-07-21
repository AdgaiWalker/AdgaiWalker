import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { LikeService } from './like.service';

@Controller('likes')
export class LikeController {
  constructor(@Inject(LikeService) private readonly likes: LikeService) {}

  @Get()
  get(@Query('path') path?: string) {
    return this.likes.get(path ?? '');
  }

  @Post()
  like(@Body() body: { path?: string }) {
    return this.likes.like(body.path ?? '');
  }
}
