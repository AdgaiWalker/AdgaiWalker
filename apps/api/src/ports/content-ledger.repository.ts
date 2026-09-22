/**
 * 内容台账仓储端口（PRD A1 / TECH-DESIGN §6.1）
 * 只负责「文件事实」：标题 / 类型 / frontmatter / 更新时间。
 * 阶段、分组、门禁缺口一律由用例层调 packages/shared 的唯一实现推导（禁止在仓储里另写判据）。
 */
export interface ContentLedgerSourceEntry {
  slug: string;
  title: string;
  /** frontmatter.type 原值（knowledge/learn/idea/tool/project） */
  type: string;
  /** 原始 frontmatter：门禁判空与可见性解析共用同一份数据 */
  frontmatter: Record<string, unknown>;
  updatedAt: string;
}

export interface ContentLedgerRepositoryPort {
  /** 列出 content/log 全部内容条目（按 slug 升序） */
  list(): Promise<ContentLedgerSourceEntry[]>;
  /** 读单条（发布前预检用）；不存在返回 null */
  get(slug: string): Promise<ContentLedgerSourceEntry | null>;
}

export const CONTENT_LEDGER_REPOSITORY = Symbol('CONTENT_LEDGER_REPOSITORY');
