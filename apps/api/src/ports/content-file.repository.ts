/** 内容文件仓储端口 — 管理端读写 content/log，依赖倒置 */
export type ContentFileMeta = {
  slug: string;
  title: string;
  type: string;
  updatedAt: string;
};

export type ContentFileDetail = ContentFileMeta & {
  raw: string;
  ext: '.md' | '.mdx';
};

export interface ContentFileRepositoryPort {
  list(): Promise<ContentFileMeta[]>;
  get(slug: string): Promise<ContentFileDetail | null>;
  save(slug: string, raw: string): Promise<ContentFileDetail>;
}

export const CONTENT_FILE_REPOSITORY = Symbol('CONTENT_FILE_REPOSITORY');
