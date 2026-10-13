import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  parseActivityBefore,
  parseActivityKinds,
  parseActivityLimit,
} from '@walker/shared';
import { validationError } from '../common/http-error';
import { ActivityService } from './activity.service';

/**
 * 运营活动流（只读两个端点，管理鉴权内，不进公网白名单）。
 *
 * - GET /ops/activity?kinds=&before=&limit=  —— 时间线（跨源归并）
 * - GET /ops/activity/counts                  —— 顶部计数（复用 /ops/overview 口径）
 *
 * 参数非法一律 400，不静默兜默认值（界面拿"我以为的筛选"看"别人的数据"是最坏情况）。
 */
@Controller('ops/activity')
export class ActivityController {
  constructor(@Inject(ActivityService) private readonly activity: ActivityService) {}

  @Get()
  async list(
    @Query('kinds') rawKinds?: string,
    @Query('before') rawBefore?: string,
    @Query('limit') rawLimit?: string,
  ) {
    const kinds = parseActivityKinds(rawKinds);
    if (kinds === null) throw validationError('kinds 参数不正确');
    const limit = parseActivityLimit(rawLimit);
    if (limit === null) throw validationError('limit 参数不正确');
    const before = parseActivityBefore(rawBefore);
    if (before === null && rawBefore) throw validationError('before 参数不正确');
    return this.activity.page({ kinds, before, limit });
  }

  @Get('counts')
  counts() {
    return this.activity.counts();
  }
}
