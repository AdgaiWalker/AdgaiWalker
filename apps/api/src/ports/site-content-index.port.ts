/**
 * 站点内容索引端口：AI nextStep 的接地数据源。
 * 只暴露 aiUsePolicy 允许被 AI 引用的条目（readable + citable），
 * 边界在数据源处收紧，下游不可能放宽。
 */

export interface SiteContentIndexEntry {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  /** 可整理为行动步骤（aiUsePolicy.actionable） */
  actionable: boolean;
}

/** 整库注入包条目：索引字段 + 正文（供 AI 一次性带全量上下文） */
export interface SiteContentFullEntry extends SiteContentIndexEntry {
  body: string;
}

/** 内容与其来源快照一起返回，调用方不得再自行拼一套公开内容过滤规则。 */
export interface SiteContentSnapshot {
  buildId: string;
  collectionHash: string;
  entries: SiteContentFullEntry[];
}

export interface SiteContentIndexPort {
  loadCitable(): Promise<SiteContentIndexEntry[]>;
  /** readable+citable 的整库正文包；总量超硬上限时按最旧优先截断 */
  loadCitableFull(): Promise<SiteContentFullEntry[]>;
  /** 与 loadCitableFull 使用同一过滤逻辑，并返回所依据的已核验快照标识。 */
  loadCitableSnapshot(): Promise<SiteContentSnapshot>;
}

export const SITE_CONTENT_INDEX = Symbol('SITE_CONTENT_INDEX');
