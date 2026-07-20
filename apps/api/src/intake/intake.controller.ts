import {
  Body,
  Controller,
  Headers,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { IntakeService } from './intake.service';

@Controller('intake')
export class IntakeController {
  constructor(
    @Inject(IntakeService) private readonly intake: IntakeService,
  ) {}

  @Post()
  async create(
    @Body() body: { body?: string; source?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('cookie') cookieHeader?: string,
  ) {
    const anonId = resolveOrSetAnon(cookieHeader, res);
    const ipKey =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
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

function resolveOrSetAnon(
  cookieHeader: string | undefined,
  res: Response,
): string {
  const match = cookieHeader?.match(/(?:^|;\s*)walker-anon=([^;]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  const id = randomUUID();
  res.setHeader(
    'Set-Cookie',
    `walker-anon=${encodeURIComponent(id)}; Path=/; Max-Age=2592000; SameSite=Lax; HttpOnly`,
  );
  return id;
}
