/**
 * 敏感词管控模块
 *
 * 参考 NorthStar shared/sensitive.ts 的分类词库模式：
 * 1. 输入拦截：搜索 query 命中敏感词 → 直接拒绝
 * 2. 输出过滤：AI 返回文本命中敏感词 → 降级为 fallback
 * 3. 六类分治：色情/暴力/赌博/违禁/辱骂/自伤
 */

// ===== 分类敏感词库 =====

const PORNOGRAPHIC: string[] = [
  '色情', '裸体', '裸照', '情色', '成人视频', '淫秽',
  '黄色视频', '黄色网站',
];

const VIOLENCE: string[] = [
  '杀人', '砍人', '捅人', '炸弹制作', '自制武器',
  '虐待动物', '自残', '自杀方法',
];

const GAMBLING: string[] = [
  '赌博', '博彩', '彩票预测', '时时彩', '百家乐',
  '老虎机', '赌场', '下注',
];

const CONTRABAND: string[] = [
  '代开发票', '买卖枪支', '迷药', '假钞',
  '信用卡套现', '洗钱',
];

const ABUSE: string[] = [
  '傻逼', '操你', '妈的', '狗日的', '王八蛋',
  '去死', '滚蛋',
];

const SELF_HARM: string[] = [
  '怎么自杀', '自杀方式', '不想活了怎么死',
];

/** 合并后的完整词库 */
const ALL_SENSITIVE_WORDS: string[] = [
  ...PORNOGRAPHIC,
  ...VIOLENCE,
  ...GAMBLING,
  ...CONTRABAND,
  ...ABUSE,
  ...SELF_HARM,
];

export interface SensitiveCheckResult {
  hit: boolean;
  words: string[];
}

export function checkSensitiveWords(text: string): SensitiveCheckResult {
  const lower = text.toLowerCase();
  const words: string[] = [];
  for (const word of ALL_SENSITIVE_WORDS) {
    if (word && lower.includes(word.toLowerCase())) {
      words.push(word);
    }
  }
  return { hit: words.length > 0, words };
}
