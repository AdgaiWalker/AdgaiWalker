/**
 * 双入口单一配置：路径与文案只在此定义，页面/导航引用。
 */
export const dualEntry = {
  ask: {
    path: '/tools',
    label: '问',
    cta: '问一步',
    shortCta: '问',
    hint: '拿下一步',
    title: '你卡在哪？',
    lead: '说清卡点，直接拿下一步。',
    /** 结果页（nextStep 独立呈现）文案，避免页面硬编码 */
    result: {
      title: '你的下一步',
      lead: '结果只保存在当前浏览器会话里。',
      emptyTitle: '这一步在这里找不到了',
      emptyLead: '结果只保存在当时的浏览器会话里，换设备或清缓存后无法还原。',
    },
  },
  browse: {
    path: '/posts',
    label: '文章',
    cta: '看文章',
    shortCta: '文章',
    hint: '读文章',
    title: '文章',
  },
} as const;

export type DualEntryKey = keyof typeof dualEntry;
