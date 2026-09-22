/**
 * 问答索引只读已核验公开快照。没有基线时失败，不拿工作区最新文件冒充公开版本。
 */
import type {
  SiteContentFullEntry,
  SiteContentIndexPort,
} from '../ports/site-content-index.port';
import { FsPublicSnapshotRepository } from './fs-public-snapshot.repository';

const MAX_ENTRIES = 40;
const MAX_SUMMARY_CHARS = 80;
/** 整库注入包的正文总字符硬上限（PRD：超 50 篇切索引式之前的保险丝） */
const MAX_FULL_PACK_CHARS = 60_000;

export class FsSiteContentIndex implements SiteContentIndexPort {
  private cache: {
    slug: string;
    title: string;
    summary: string;
    tags: string[];
    actionable: boolean;
    body: string;
  }[] = [];

  private async readItems() {
    const snapshot = await new FsPublicSnapshotRepository().readActive();
    const items = snapshot.items.filter((item) => item.readable && item.citable);
    this.cache = items.slice(0, MAX_ENTRIES).map((item) => ({
      slug: item.slug,
      title: item.title,
      summary: item.summary.slice(0, MAX_SUMMARY_CHARS),
      tags: item.tags.slice(0, 5),
      actionable: false,
      body: item.body,
    }));
    return this.cache;
  }

  async loadCitable() {
    const items = await this.readItems();
    return items.map(({ body: _body, ...rest }) => rest);
  }

  async loadCitableFull() {
    const items = await this.readItems();
    // items 按日期倒序（构建产物保证）：超预算时从最旧的一端丢弃
    const out: SiteContentFullEntry[] = [];
    let used = 0;
    for (const item of items) {
      if (used + item.body.length > MAX_FULL_PACK_CHARS) break;
      out.push(item);
      used += item.body.length;
    }
    return out;
  }
}
