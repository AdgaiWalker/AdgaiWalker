import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  CLUE_QUOTA_MIN_LENGTH,
  RATE_LIMITS,
  RATE_WINDOW_MINUTES,
} from '@walker/shared';
import { getGuestQuota } from '../adapters/prisma-guest-quota.adapter';
import {
  extractClientIpKey,
  resolveOrSetAnonId,
} from '../auth/anon-cookie';
import { IntakeService } from './intake.service';

/** HTTP 薄层：协议进出 → 调用用例，不写领域规则 */
@Controller('intake')
export class IntakeController {
  constructor(
    @Inject(IntakeService) private readonly intake: IntakeService,
  ) {}

  @Get('config')
  config() {
    return {
      guestQuota: getGuestQuota(),
      quotaMinLength: CLUE_QUOTA_MIN_LENGTH,
      rateLimit: RATE_LIMITS.guestPerWindow,
      rateWindowMinutes: RATE_WINDOW_MINUTES,
    };
  }

  @Post()
  async create(
    @Body() body: { body?: string; source?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('cookie') cookieHeader?: string,
  ) {
    const anonId = resolveOrSetAnonId(cookieHeader, res);
    const ipKey = extractClientIpKey(req);
    const result = await this.intake.intake({
      body: body.body ?? '',
      source: body.source,
      anonId,
      ipKey,
      isAuthenticated: false,
    });
    res.status(201);
    return result;
  }
}
