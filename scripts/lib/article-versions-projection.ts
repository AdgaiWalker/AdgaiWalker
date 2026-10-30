/**
 * 文章版本库投影：content/versions → apps/web/src/generated/article-versions.json
 *
 * 纪律（skill article-version-history）：
 * - 公开的是构建期静态页的数据源，不是直连数据库/文件系统的查询接口——web 只读这份 JSON。
 * - 只读 content/versions（公开区，只追加），绝不读 content/log（草稿区）。
 * - 产物含每版正文（静态化必须），版本索引不变量逐篇校验，损坏即构建失败（fail-closed）。
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  isArticleVersionIndex,
  verifyArticleVersionIndex,
  type ArticleVersionIndex,
} from '../../packages/shared/src/article-version';
import { repoRoot, webGeneratedDir } from './paths';

export interface ProjectedArticleVersion {
  version: number;
  note: string;
  publishedAt: string;
  releaseId: string;
  body: string;
}

export interface ArticleVersionsProjection {
  generatedAt: string;
  /** slug → 升序版本列表（含正文） */
  articles: Record<string, ProjectedArticleVersion[]>;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function projectArticleVersions(): ArticleVersionsProjection {
  const versionsDir = path.join(repoRoot, 'content/versions');
  const articles: Record<string, ProjectedArticleVersion[]> = {};
  if (fs.existsSync(versionsDir)) {
    for (const name of fs.readdirSync(versionsDir)) {
      if (name === 'blobs' || !SLUG_RE.test(name)) continue;
      const slugDir = path.join(versionsDir, name);
      if (!fs.statSync(slugDir).isDirectory()) continue;
      const indexPath = path.join(slugDir, 'index.json');
      if (!fs.existsSync(indexPath)) continue;
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as unknown;
      if (!isArticleVersionIndex(index)) {
        throw new Error(`article-version-index-invalid: ${name}`);
      }
      const problems = verifyArticleVersionIndex(index);
      if (problems.length > 0) {
        throw new Error(`article-version-index-invalid: ${name}: ${problems.join('；')}`);
      }
      const versions: ProjectedArticleVersion[] = (index as ArticleVersionIndex).versions.map((v) => {
        const blobPath = path.join(versionsDir, 'blobs', `${v.contentHash}.md`);
        if (!fs.existsSync(blobPath)) {
          throw new Error(`article-version-blob-missing: ${name} v${v.version} (${v.contentHash.slice(0, 12)})`);
        }
        return {
          version: v.version,
          note: v.note,
          publishedAt: v.publishedAt,
          releaseId: v.releaseId,
          body: fs.readFileSync(blobPath, 'utf8'),
        };
      });
      if (versions.length > 0) articles[name] = versions;
    }
  }
  return { generatedAt: new Date().toISOString(), articles };
}

export function writeArticleVersionsProjection(): ArticleVersionsProjection {
  const projection = projectArticleVersions();
  const out = path.join(webGeneratedDir, 'article-versions.json');
  // 与 content.json 同一纪律：内容未变不重写（generatedAt 不制造无意义 diff）
  let unchanged = false;
  try {
    const existing = JSON.parse(fs.readFileSync(out, 'utf8')) as { articles?: unknown };
    unchanged = JSON.stringify(existing.articles) === JSON.stringify(projection.articles);
  } catch {
    /* 无旧文件或损坏 → 正常写入 */
  }
  if (unchanged) {
    console.log(`article-versions unchanged (${Object.keys(projection.articles).length} articles); keep existing`);
  } else {
    fs.mkdirSync(webGeneratedDir, { recursive: true });
    fs.writeFileSync(out, JSON.stringify(projection, null, 2));
    console.log(`wrote article-versions → ${out} (${Object.keys(projection.articles).length} articles)`);
  }
  return projection;
}
