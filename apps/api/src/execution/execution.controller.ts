import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ExecutionService } from './execution.service';

@Controller('executions')
@UseGuards(AdminAuthGuard)
export class ExecutionController {
  constructor(
    @Inject(ExecutionService) private readonly executions: ExecutionService,
  ) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.executions.list(limit ? Number(limit) : 50);
  }

  @Post(':id/deliver')
  deliver(
    @Param('id') id: string,
    @Body() body: { url?: string; form?: string; note?: string },
  ) {
    return this.executions.deliver(id, body);
  }

  @Post(':id/review')
  review(
    @Param('id') id: string,
    @Body() body: { outcome?: string; evidence?: string },
  ) {
    return this.executions.review(id, {
      outcome: body.outcome ?? '',
      evidence: body.evidence,
    });
  }
}
