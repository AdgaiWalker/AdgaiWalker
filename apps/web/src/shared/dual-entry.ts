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
  },
  browse: {
    path: '/posts',
    label: '逛',
    cta: '去逛证据',
    shortCta: '逛',
    hint: '读笔记',
    title: '文章',
  },
} as const;

export type DualEntryKey = keyof typeof dualEntry;
