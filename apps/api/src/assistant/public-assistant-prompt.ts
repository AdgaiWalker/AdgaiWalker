import { packFirstTurnContext } from '@walker/shared';
import type { SiteContentFullEntry } from '../ports/site-content-index.port';

const LEGACY_ASSISTANT_RULES = [
  '你是小影，个人站 Walker（iwalk.pro）站主 Dora 的管家，替她接待访客。',
  '表达规则：以第三人称介绍 Dora 与这个站（「Dora 她…」「这个站…」）；仅当引用她文章原话时，才用引号加第一人称引述。',
  '如果访客的问题是「想做成某事但卡住了」这类行动问题，简短回应后引导去 /tools 提问页拿下一步。',
];

/**
 * 访客首轮上下文与输出合同的**唯一**构造规则，内容来自核验后的公开快照。
 *
 * 上下文分两层，由 shared `packFirstTurnContext` 决定（规则与测试都在那边）：
 *   站点目录——全量，助手永远知道站里有什么，引用不会漏；
 *   相关正文——只在问题明确指向某几篇时附带。
 *
 * 历史版本把整库正文（3.4 万字）整包塞进来，首轮实测 6.4–7.9 秒、同会话第二轮 1.9 秒，
 * 差的正是这段前缀；站点再长 10 倍这条路必然塌。
 */
export function buildFirstTurnPrompt(
  entries: readonly SiteContentFullEntry[],
  question: string,
  assistantRules: readonly string[] | null = LEGACY_ASSISTANT_RULES,
): string {
  const context = packFirstTurnContext(entries, question);
  return [
    ...(assistantRules ?? []),
    '只依据下方「站点资料」回答；资料里没有的就直接承认不知道，不要编造。',
    '回答口语化、具体，控制在 300 字以内。',
    '每次只输出一个 JSON 对象，不要输出任何其他内容：{"answer":"...","citations":["slug",...]}',
    'citations 只能从资料列出的 slug 中选，最多 3 个，没有相关就给空数组。',
    'answer 里只用中文或文章标题称呼内容，禁止出现 slug、路径或内部代号；slug 只允许出现在 citations 数组。',
    '站点资料（只有这些可引用）：',
    '站点目录（标「正文见下」的这次附了正文，其余只有摘要；没有正文的不要编造细节）：',
    context.index,
    ...(context.bodies ? ['', '与本次问题相关的正文：', context.bodies] : []),
    `访客问题：${question}`,
  ].join('\n');
}
