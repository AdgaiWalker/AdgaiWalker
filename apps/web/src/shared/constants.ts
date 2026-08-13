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

/** Ferry 主题线 frontmatter 名（与 content:gen series 一致） */
export const FERRY_SERIES_NAME = 'Ferry';

/** 前进三部曲主题线 frontmatter 名（与 content:gen series 一致） */
export const ADVANCE_TRILOGY_SERIES_NAME = '前进三部曲';

/**
 * 实验室主题线（配置）
 * 我的记录 + 哲学思考；与教程/资源/跟学正交。
 * path 为空时只在实验室枢纽内联列出，不设专页。
 */
export type LabLineDef = {
  series: string;
  /** 侧栏/枢纽短标 */
  label: string;
  /** 一条人话：这条线是什么 */
  blurb: string;
  /** WEB_ROUTES 键；无专页则省略 */
  routeKey?: 'advanceTrilogy' | 'ferry';
};

export const LAB_LINES: readonly LabLineDef[] = [
  {
    series: ADVANCE_TRILOGY_SERIES_NAME,
    label: '前进三部曲',
    blurb: '我自己的：为什么走、路上存什么、走向哪',
    routeKey: 'advanceTrilogy',
  },
  {
    series: FERRY_SERIES_NAME,
    label: 'Ferry',
    blurb: '哲学协议：差距→行动、做减法、螺旋进化',
    routeKey: 'ferry',
  },
  {
    series: '设计思考',
    label: '设计思考',
    blurb: '为人搭桥、做减法——设计侧的实验笔记',
  },
  {
    series: '站志',
    label: '站志',
    blurb: '启航与停靠：站本身的痕迹',
  },
] as const;

/** 站外链接 SSOT（壳/关于/名片共用，勿散落硬编码） */
export const SITE_LINKS = {
  email: SITE_EMAIL,
  mailto: `mailto:${SITE_EMAIL}`,
  github: 'https://github.com/AdgaiWalker',
  bilibili: 'https://space.bilibili.com/1029612512',
  xiaohongshu:
    'https://www.xiaohongshu.com/user/profile/689dd905000000001802921e',
  rss: '/rss.xml',
} as const;

/** 中文阅读速度（字/分钟），用于估算阅读时长 */
export const CHARS_PER_MINUTE_ZH = 400;

/** 毫秒时间常量 */
export const MS_PER_DAY = 86400000;
export const MS_PER_HOUR = 3600000;
export const MS_PER_MINUTE = 60000;
export const MS_PER_SECOND = 1000;
