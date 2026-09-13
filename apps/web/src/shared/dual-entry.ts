/**
 * 双入口单一配置：路径与文案只在此定义，页面/导航引用。
 */
export const dualEntry = {
  ask: {
    path: '/tools',
    label: '卡',
    cta: '我卡住了',
    shortCta: '卡',
    hint: '拿下一步',
    title: '你卡在哪？',
    lead: '用场景描述困扰或目标。无需登录即可试一次；成功后重点看「下一步」。',
    /** 结果页（nextStep 独立呈现）文案，避免页面硬编码 */
    result: {
      title: '你的下一步',
      lead: '这是本次卡点拿到的下一步与它的依据；结果只保存在生成它的这个浏览器里。',
      emptyTitle: '这一步在这里找不到了',
      emptyLead:
        '结果只保存在生成它的浏览器会话里：换设备、换链接、清过缓存都打不开。这不是出错，是这里确实看不到——回卡口再问一次最快。',
    },
  },
  browse: {
    path: '/posts',
    label: '逛',
    cta: '去逛证据',
    shortCta: '逛',
    hint: '读证据',
    title: '证据',
  },
} as const;

export type DualEntryKey = keyof typeof dualEntry;
