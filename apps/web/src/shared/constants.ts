export const PLATFORM_ICON_MAP: Record<string, string> = {
  bilibili: 'lucide:circle-play',
  douyin: 'lucide:music',
  xiaohongshu: 'lucide:book-open',
  youtube: 'lucide:youtube',
  github: 'lucide:github',
  zhihu: 'lucide:message-circle',
};

/** 状态显示标签 */
export const STATUS_LABELS: Record<string, string> = {
  thinking: '构思中',
  validating: '验证中',
  building: '实现中',
  verified: '已完成',
  archived: '已归档',
};

/** 状态排序权重（越大越活跃） */
export const STATUS_WEIGHT: Record<string, number> = {
  thinking: 1,
  validating: 2,
  building: 3,
  verified: 4,
  archived: 0,
};

/** 站点联系邮箱 */
export const SITE_EMAIL = 'praxiswalker@gmail.com';

/** 中文阅读速度（字/分钟），用于估算阅读时长 */
export const CHARS_PER_MINUTE_ZH = 400;

/** 毫秒时间常量 */
export const MS_PER_DAY = 86400000;
export const MS_PER_HOUR = 3600000;
export const MS_PER_MINUTE = 60000;
export const MS_PER_SECOND = 1000;
