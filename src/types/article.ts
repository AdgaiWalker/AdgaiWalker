/**
 * 文章条目 — ArticleNav 共享的轻量类型
 */
export interface ArticleEntry {
  id: string;
  title: string;
  date: Date;
  tags?: string[];
  summary?: string;
}
