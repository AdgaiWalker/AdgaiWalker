/** 规则 nextStep 五桶 + default（关 AI 时必须非空） */

export type NextStepBucketId =
  | 'learn-ai'
  | 'writing'
  | 'coding'
  | 'form'
  | 'productivity'
  | 'default';

interface Bucket {
  id: NextStepBucketId;
  triggers: string[];
  nextStep: string;
}

const BUCKETS: Bucket[] = [
  {
    id: 'learn-ai',
    triggers: ['学 ai', '学ai', '入门', '从哪开始', '不会用'],
    nextStep:
      '先选一个最小场景（比如写一段周报提纲），用同一工具连续做 3 次，记下每次卡在哪一步。',
  },
  {
    id: 'writing',
    triggers: ['公众号', '文章', '写作', '文案', '周报'],
    nextStep:
      '用一句话说清读者是谁、读完要能做什么；先写 5 条大纲再扩一段正文。',
  },
  {
    id: 'coding',
    triggers: ['代码', '项目', '接口', 'bug', '改页面'],
    nextStep:
      '复现问题并写清期望/实际；先改最小可验证路径，跑通再扩范围。',
  },
  {
    id: 'form',
    triggers: ['报名', '表单', '收集', '问卷'],
    nextStep:
      '列出必填字段 ≤5 个与提交后去向；先做一版纸面字段表再落工具。',
  },
  {
    id: 'productivity',
    triggers: ['效率', '提效', '重复', '加班'],
    nextStep:
      '挑本周最重复的一件事，记耗时与触发条件，先自动化或模板化其中一步。',
  },
  {
    id: 'default',
    triggers: [],
    nextStep:
      '用一句完整场景描述：谁、在什么情况下、想达成什么、现在卡在哪（至少 10 个字）。',
  },
];

export function matchNextStepBucket(body: string): NextStepBucketId {
  const lower = body.toLowerCase();
  for (const b of BUCKETS) {
    if (b.id === 'default') continue;
    if (b.triggers.some((t) => lower.includes(t))) return b.id;
  }
  return 'default';
}

export function ruleNextStep(body: string): {
  bucketId: NextStepBucketId;
  nextStep: string;
} {
  const bucketId = matchNextStepBucket(body);
  const bucket = BUCKETS.find((b) => b.id === bucketId) ?? BUCKETS[BUCKETS.length - 1];
  return { bucketId, nextStep: bucket.nextStep };
}

export function listNextStepBuckets(): readonly Bucket[] {
  return BUCKETS;
}

/** AI nextStep 输出契约：结构化校验不通过一律拒收（调用方降级规则版） */

const NEXT_STEP_BUCKET_IDS: readonly NextStepBucketId[] = [
  'learn-ai',
  'writing',
  'coding',
  'form',
  'productivity',
  'default',
];

export function isNextStepBucketId(value: unknown): value is NextStepBucketId {
  return (
    typeof value === 'string' &&
    (NEXT_STEP_BUCKET_IDS as readonly string[]).includes(value)
  );
}

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\([^)]*\)/g;

/** nextStep 以纯文本展示：折叠 markdown 链接为文字、去尖括号、压空白 */
export function sanitizeNextStepText(raw: string): string {
  return raw
    .replace(MARKDOWN_LINK_RE, '$1')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const AI_NEXT_STEP_MAX_LENGTH = 200;

export interface AiNextStepOutput {
  bucketId: NextStepBucketId;
  nextStep: string;
  /** 仅接受 citable 集合内的 slug；否则强制 null（AI 边界不可放宽） */
  suggestedSlug: string | null;
}

/**
 * 校验 AI 产出的 nextStep JSON。返回 null 表示拒收整个输出。
 * suggestedSlug 不合法时不拒收整体，只降为 null——fail-closed 在边界上。
 */
export function parseAiNextStepOutput(
  raw: unknown,
  citableSlugs: ReadonlySet<string>,
): AiNextStepOutput | null {
  let candidate = raw;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== 'object') return null;
  const obj = candidate as Record<string, unknown>;
  if (!isNextStepBucketId(obj.bucketId)) return null;
  if (typeof obj.nextStep !== 'string') return null;
  const nextStep = sanitizeNextStepText(obj.nextStep);
  if (nextStep.length < 4 || nextStep.length > AI_NEXT_STEP_MAX_LENGTH) {
    return null;
  }
  let suggestedSlug: string | null = null;
  if (
    typeof obj.suggestedSlug === 'string' &&
    citableSlugs.has(obj.suggestedSlug)
  ) {
    suggestedSlug = obj.suggestedSlug;
  }
  return { bucketId: obj.bucketId, nextStep, suggestedSlug };
}
