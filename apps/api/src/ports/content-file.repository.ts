/** 内容文件仓储端口 — 管理端读写 content/log，依赖倒置 */
export type ContentFileMeta = {
  slug: string;
  title: string;
  type: string;
  updatedAt: string;
};

export type ContentFileDetail = ContentFileMeta & {
  raw: string;
  hash: string;
  ext: '.md' | '.mdx';
};

export interface ContentFileRepositoryPort {
  list(): Promise<ContentFileMeta[]>;
  get(slug: string): Promise<ContentFileDetail | null>;
  /** expectedHash is null only for create-if-absent; otherwise it must match current UTF-8 bytes. */
  save(slug: string, raw: string, expectedHash: string | null): Promise<ContentFileDetail>;
}

export const CONTENT_FILE_REPOSITORY = Symbol('CONTENT_FILE_REPOSITORY');
