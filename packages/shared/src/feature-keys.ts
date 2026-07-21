/** 功能单元字典（先登记再埋点） */
export const FEATURE_KEYS = {
  'nav.home': '首页主壳渲染',
  'post.list': '文章列表',
  'post.read': '文章详情',
  'search.query': '搜索提交',
  'match.intake': '问答 intake 成功并返回 nextStep',
  'tools.resource_click': '资源链接点击',
  'like.click': '点赞成功',
  'auth.login': '登录成功',
  'clue.create_manual': 'admin 手动建线索',
  'seed.promote': '主选成功',
  'execution.review': '检验写入成功',
  'content.feedback': '内容反馈提交成功',
} as const;

export type FeatureKey = keyof typeof FEATURE_KEYS;

export function isFeatureKey(value: string): value is FeatureKey {
  return value in FEATURE_KEYS;
}
