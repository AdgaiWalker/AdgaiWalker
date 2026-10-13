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
import type { ContentReleaseStage } from './content-change.js';
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

/** 台账展示分组：产品 / 文章 / 想法 / 小店（PRD §3.4 / C22） */
export const CONTENT_GROUPS = ['product', 'article', 'idea', 'shop'] as const;
export type ContentGroup = (typeof CONTENT_GROUPS)[number];

/**
 * frontmatter.type → 展示分组的映射（纯展示层，不新增类型值、不回写）。
 * type 现值集合：knowledge / learn / idea / tool / project / shop。
 * 归类口径：project / tool 是「产品」；knowledge / learn 是「文章」；idea 是「想法」；shop 是「小店」；
 * 未识别值归「文章」（内容主体），不另造分组。
 */
const CONTENT_TYPE_TO_GROUP: Record<string, ContentGroup> = {
  project: 'product',
  tool: 'product',
  knowledge: 'article',
  learn: 'article',
  idea: 'idea',
  shop: 'shop',
};

/** 项目状态（C22 对齐项目内容模型）：与站内既有 project frontmatter.status 映射 */
export const PROJECT_STATUSES = [
  'planning',
  'validating',
  'in-progress',
  'verified',
  'completed',
  'archived',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface ProjectMetadata {
  status?: string;
  url?: string;
  series?: string;
  seriesOrder?: number;
  hall?: 'showcase' | 'exchange' | string;
  resources?: Array<{
    name: string;
    url: string;
    type?: string;
    description?: string;
  }>;
}

export function validateProjectMetadata(data: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (data.status !== undefined && typeof data.status !== 'string') {
    errors.push('项目 status 必须为有效字符串');
  }
  if (data.url !== undefined && typeof data.url !== 'string') {
    errors.push('项目 url 必须为有效字符串');
  }
  if (data.resources !== undefined && !Array.isArray(data.resources)) {
    errors.push('项目 resources 必须为资源数组');
  }
  return { valid: errors.length === 0, errors };
}

/** 小店内容边界声明（PRD A20 / TECH-DESIGN §2.2）：不建立订单/库存模型 */
export const SHOP_BOUNDARY_NOTICE =
  '小店交易与订单履约系统尚未接入，当前仅作为商品与服务介绍内容展示入口。不建立订单或库存数据模型。';

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
  publication: {
    /** 公开投影 hash，与发布证明使用同一命名空间。 */
    currentPublicHash: string | null;
    publishedHash: string | null;
    verifiedAt: string | null;
    indexedHash: string | null;
    latestAttemptStage: ContentReleaseStage | null;
  };
  updatedAt: string;
}

/** 台账读模型：GET /admin/content/ledger 的响应体。 */
export interface ContentLedger {
  items: ContentLedgerEntry[];
  generatedAt: string;
  /** git 不可用时为 false：阶段相关的脏/干净事实缺失，前端显示「未知」 */
  gitAvailable: boolean;
  /** 发布事实读取失败时为 false；不得把失败当成没有确证记录。 */
  publicationAvailable: boolean;
}
