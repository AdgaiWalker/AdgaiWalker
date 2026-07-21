/**
 * 前台展示用规则文案（限流数字与 packages/shared 同源，不在 UI 重写状态机）
 */
import {
  CLUE_BODY_MIN_LENGTH,
  GUEST_INTAKE_QUOTA,
  RATE_LIMITS,
  RATE_WINDOW_MINUTES,
} from '@walker/shared';

export const GUEST_RATE_LIMIT = RATE_LIMITS.guestPerWindow;
export const USER_RATE_LIMIT = RATE_LIMITS.userPerWindow;
export { CLUE_BODY_MIN_LENGTH, GUEST_INTAKE_QUOTA, RATE_WINDOW_MINUTES };

export const ERROR_CODE_LABELS: Record<string, string> = {
  'guest-quota-exceeded':
    '游客完整问答次数已用完（每位访客 1 次）。登录后可继续，或改用管理端热记。',
  'rate-limited': `请求过于频繁（游客 ${GUEST_RATE_LIMIT} 次 / ${RATE_WINDOW_MINUTES} 分钟）。请稍后再试。`,
  'storage-unavailable': '服务暂时无法写入，请稍后再试。',
  'validation-error': '输入不合法，请检查后重试。',
  'clue-body-too-short': `描述至少 ${CLUE_BODY_MIN_LENGTH} 个字（去掉首尾空格）。`,
  'missing-clue': '主选必须挂入池线索。',
};

export function explainErrorCode(code: string | undefined, fallback?: string): string {
  if (!code) return fallback ?? '请求失败';
  return ERROR_CODE_LABELS[code] ?? fallback ?? code;
}

export const INTAKE_RULE_HINTS = [
  `描述至少 ${CLUE_BODY_MIN_LENGTH} 个字`,
  `游客可完整体验 ${GUEST_INTAKE_QUOTA} 次（30 天内）`,
  `限流：游客 ${GUEST_RATE_LIMIT} 次 / ${RATE_WINDOW_MINUTES} 分钟（按访问识别）`,
  '关 AI 时仍会返回可执行的「下一步」（规则五桶）',
] as const;

/** 首页 Spark 兜底脑洞 */
export const SPARK_FALLBACKS: Array<{
  title: string;
  slug: string | null;
  isReal: boolean;
}> = [
  {
    title: '开发一个可以将猫咪喵喵声自动翻译成拍立得卡通日记的 APP！',
    slug: null,
    isReal: false,
  },
  {
    title: '做一款 VSCode 插件：当你的代码写出 Bug 时，自动播放悲伤的萨克斯风！',
    slug: null,
    isReal: false,
  },
  {
    title: '构建一个 AI 虚拟老板：每天早晨用极其温柔的声线催你写代码，并提供心理按摩！',
    slug: null,
    isReal: false,
  },
  {
    title: '设计一款智能水杯：AI 会根据你今天敲键盘的次数和写 Bug 的频率，强行提醒你喝咖啡！',
    slug: null,
    isReal: false,
  },
  {
    title: '打造一款 AI 梦境发生器：晚上输入你想梦到的场景，AI 自动为你脑补一段催眠故事！',
    slug: null,
    isReal: false,
  },
  {
    title: '做个 AI 厨艺拯救者：拍一下冰箱里剩下的烂西红柿和半盒豆腐，AI 自动生成一道米其林级别的黑暗料理菜谱！',
    slug: null,
    isReal: false,
  },
  {
    title: '开发一款 AI 宠物社交机器人：让你的猫在网上和隔壁的狗通过 GPT 聊天，甚至能网恋！',
    slug: null,
    isReal: false,
  },
  {
    title: '做一款「键盘侠净化器」：用 AI 自动把你写在终端里的脏话脏代码注释重写成高雅的古典诗词！',
    slug: null,
    isReal: false,
  },
  {
    title: '开发一款「滑板AI跟拍仪」：用 AI 动作捕捉算法，自动在滑板腾空那一瞬间抓拍出最帅的侧脸！',
    slug: null,
    isReal: false,
  },
];
