import { Body, Controller, Get, Inject, Param, Patch, Query } from '@nestjs/common';
import { validationError } from '../common/http-error';
import { LogResourceService } from './log-resource.service';

type RetentionPolicyInput = { detailRetentionDays: number; aggregateRetentionDays: number };

function parsePolicy(body: unknown): RetentionPolicyInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw validationError('log-retention-invalid');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['detailRetentionDays', 'aggregateRetentionDays'].includes(key))) {
    throw validationError('log-retention-invalid');
  }
  return {
    detailRetentionDays: typeof input.detailRetentionDays === 'number' ? input.detailRetentionDays : Number.NaN,
    aggregateRetentionDays: typeof input.aggregateRetentionDays === 'number' ? input.aggregateRetentionDays : Number.NaN,
  };
}

function parseLimit(raw?: string): number {
  if (raw === undefined) return 100;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) throw validationError('log-resource-limit-invalid');
  return Math.min(limit, 1_000);
}

@Controller('admin')
export class LogResourceController {
  constructor(@Inject(LogResourceService) private readonly logs: LogResourceService) {}

  @Get('log-retention')
  retentionPolicy() {
    return this.logs.getPolicy();
  }

  @Patch('log-retention')
  updateRetentionPolicy(@Body() body: unknown) {
    return this.logs.updatePolicy(parsePolicy(body));
  }

  @Get('log-resources/conversations/:conversationId')
  async conversationResources(@Param('conversationId') conversationId: string) {
    const resources = await this.logs.resourcesForConversation(conversationId);
    return {
      conversationId,
      resources: resources.map(({ id, resourceType, resourceCreatedAt, registeredAt, expiresAt, expired }) => ({
        id, resourceType, resourceCreatedAt, registeredAt, expiresAt, expired,
      })),
    };
  }

  @Get('log-resources/expired')
  async expiredResources(@Query('limit') limit?: string) {
    const resources = await this.logs.expiredResources(new Date(), parseLimit(limit));
    return {
      resources: resources.map(({ id, conversationId, resourceType, resourceCreatedAt, expiresAt }) => ({
        id, conversationId, resourceType, resourceCreatedAt, expiresAt,
      })),
    };
  }
}
