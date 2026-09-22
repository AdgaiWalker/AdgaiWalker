/**
 * 内容阶段推导（PRD-A §3.4 的唯一实现，PRD A2：全局搜索不得有第二处）。
 *
 * 阶段是派生结果，不是人工状态字段：由两个既有事实推导——
 * frontmatter visibility（resolveVisibility 值域）与门禁缺失字段
 * （missingPublishedPostFields 口径）+ git 工作区脏否。
 *
 * 门禁字段清单只存在于 content.ts（PUBLISHED_POST_REQUIRED_FIELDS），
 * 本文件只消费它的结果，禁止在此复制第二份清单。
 */

import type { ContentVisibility, PublishedPostRequiredField } from './content.js';
import { missingPublishedPostFields, resolveVisibility } from './content.js';

/** 内容生命周期四阶段（PRD §3.4） */
export const CONTENT_STAGES = ['draft', 'review', 'ready', 'live'] as const;
export type ContentStage = (typeof CONTENT_STAGES)[number];

export function isContentStage(value: unknown): value is ContentStage {
  return (
    typeof value === 'string' &&
    (CONTENT_STAGES as readonly string[]).includes(value)
  );
}

export interface DeriveContentStageInput {
  /** resolveVisibility 的值域：public / draft / private */
  visibility: ContentVisibility;
  /** missingPublishedPostFields 的结果（空数组即门禁通过） */
  missingFields: readonly PublishedPostRequiredField[];
  /** git 工作区该文件是否脏（有未提交修改） */
  dirty: boolean;
}

/**
 * 阶段判据（与 PRD §3.4 逐字一致）：
 * - draft  草稿   ：visibility !== 'public'（private 归入草稿并标注私密口径）
 * - review 待审   ：visibility === 'public'，且门禁缺失字段非空
 * - ready  待上线 ：visibility === 'public'，门禁通过，工作区该文件为脏
 * - live   已上线 ：visibility === 'public'，门禁通过，工作区该文件干净
 */
export function deriveContentStage(input: DeriveContentStageInput): ContentStage {
  if (input.visibility !== 'public') return 'draft';
  if (input.missingFields.length > 0) return 'review';
  return input.dirty ? 'ready' : 'live';
}

/**
 * 从原始 frontmatter 直接推导阶段的便捷入口：
 * visibility 与缺失字段的计算全部委托 content.ts 的既有函数，
 * 保证台账、门禁面板与构建门禁（check-content-fields）同一口径。
 */
export function deriveContentStageFromFrontmatter(
  data: Record<string, unknown>,
  dirty: boolean,
): ContentStage {
  return deriveContentStage({
    visibility: resolveVisibility(data),
    missingFields: missingPublishedPostFields(data),
    dirty,
  });
}

/* ========== 展示层分组（PRD §3.4 末段：仅视图归类，不回写 frontmatter） ========== */

/** 台账展示分组：产品 / 文章 / 想法 */
export const CONTENT_GROUPS = ['product', 'article', 'idea'] as const;
export type ContentGroup = (typeof CONTENT_GROUPS)[number];

/**
 * frontmatter.type → 展示分组的映射（纯展示层，不新增类型值、不回写）。
 * type 现值集合：knowledge / learn / idea / tool / project（PRD 附录 A 全库扫描）。
 * 归类口径：project / tool 是「产品」；knowledge / learn 是「文章」；idea 是「想法」；
 * 未识别值归「文章」（内容主体），不另造分组。
 */
const CONTENT_TYPE_TO_GROUP: Record<string, ContentGroup> = {
  project: 'product',
  tool: 'product',
  knowledge: 'article',
  learn: 'article',
  idea: 'idea',
};

export function resolveContentGroup(type: string): ContentGroup {
  return CONTENT_TYPE_TO_GROUP[type] ?? 'article';
}

/* ========== 内容台账读模型契约（api 产出 / admin 消费的唯一来源） ========== */

/**
 * 台账条目：文件事实（可见性 / 门禁缺口 / 分组 / 阶段）+ git 事实（该文件脏否）。
 * 阶段字段来自 deriveContentStage（本文件唯一实现），消费方不得再推导。
 */
export interface ContentLedgerEntry {
  slug: string;
  title: string;
  /** frontmatter.type 原值（knowledge/learn/idea/tool/project） */
  type: string;
  /** 展示层分组（产品/文章/想法） */
  group: ContentGroup;
  /** 四阶段（draft/review/ready/live） */
  stage: ContentStage;
  visibility: ContentVisibility;
  /** 门禁缺失字段；非 public 时为空（草稿不显示门禁缺口） */
  missing: PublishedPostRequiredField[];
  /** git 工作区该文件是否脏 */
  dirty: boolean;
  updatedAt: string;
}

/** 台账读模型：GET /admin/content/ledger 的响应体。 */
export interface ContentLedger {
  items: ContentLedgerEntry[];
  generatedAt: string;
  /** git 不可用时为 false：阶段相关的脏/干净事实缺失，前端显示「未知」 */
  gitAvailable: boolean;
}
