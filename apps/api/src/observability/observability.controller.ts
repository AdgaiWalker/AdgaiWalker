/**
 * 观测查询 HTTP 薄层（管理面：token 防线内，不进公网白名单）。
 * 路径对齐数据页三标签：/admin/usage/stats · /admin/ai/stats · /admin/journey
 * 外加事件写入：POST /admin/events（判断代理 telemetry 回写，external agent 观测唯一入口）
 */
import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { isFeatureKey } from '@walker/shared';
import { validationError } from '../common/http-error';
import {
  OBSERVABILITY_DEFAULT_DAYS,
  ObservabilityService,
  type FeatureEventIngestInput,
} from './observability.service';

const EVENT_KINDS = ['expose', 'attempt', 'success', 'fail'] as const;
const ACTOR_TYPES = ['guest', 'user', 'owner'] as const;
/** props 只放工具名一类小字段；超过此长度即拒（防止把大正文塞进事件表） */
const MAX_PROPS_BYTES = 2_000;

function parseDays(raw?: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : OBSERVABILITY_DEFAULT_DAYS;
}

/** 协议层解析 + 字典校验：先登记再埋点，未知 featureKey 直接拒 */
function parseEventBody(body: unknown): FeatureEventIngestInput {
  const raw = (body ?? {}) as Record<string, unknown>;

  const featureKey = typeof raw.featureKey === 'string' ? raw.featureKey : '';
  if (!isFeatureKey(featureKey)) throw validationError('unknown-feature-key');

  const event = typeof raw.event === 'string' ? raw.event : '';
  if (!(EVENT_KINDS as readonly string[]).includes(event)) {
    throw validationError('invalid-event-kind');
  }

  const actorType = typeof raw.actorType === 'string' ? raw.actorType : 'owner';
  if (!(ACTOR_TYPES as readonly string[]).includes(actorType)) {
    throw validationError('invalid-actor-type');
  }

  const props =
    raw.props && typeof raw.props === 'object'
      ? (raw.props as Record<string, unknown>)
      : null;
  if (props && JSON.stringify(props).length > MAX_PROPS_BYTES) {
    throw validationError('props-too-large');
  }

  return {
    featureKey,
    event: event as FeatureEventIngestInput['event'],
    actorType: actorType as FeatureEventIngestInput['actorType'],
    failCode: typeof raw.failCode === 'string' ? raw.failCode : null,
    props,
  };
}

@Controller('admin')
export class ObservabilityController {
  constructor(
    @Inject(ObservabilityService)
    private readonly observability: ObservabilityService,
  ) {}

  @Get('usage/stats')
  usageStats(@Query('days') days?: string) {
    return this.observability.usageStats(parseDays(days));
  }

  @Get('ai/stats')
  aiStats(@Query('days') days?: string) {
    return this.observability.aiStats(parseDays(days));
  }

  @Get('journey')
  journey(@Query('days') days?: string, @Query('anonId') anonId?: string) {
    return this.observability.journey(parseDays(days), anonId?.trim() || undefined);
  }

  @Post('events')
  recordEvent(@Body() body: unknown) {
    return this.observability.recordEvent(parseEventBody(body));
  }
}
