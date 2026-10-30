/**
 * content/versions 目录解析（唯一实现）——按优先级决定公开区版本库落点：
 * 1. ARTICLE_VERSIONS_DIR 显式覆盖（部署/测试专用）：信任并创建。
 * 2. CONTENT_LOG_DIR 显式覆盖：取它的**姊妹目录** versions——测试把内容目录改到临时目录时，
 *    版本库自动跟着走，绝不回落到仓库真实版本库（这是曾把测试 slug 写进生产数据的那条漏线）。
 * 3. 按运行时 cwd 的 content/log 候选推导姊妹目录（API 从仓库根或 apps/api 启动都落在仓库根）。
 */
import fs from 'node:fs/promises';
import path from 'node:path';

function versionsSiblingOf(logDir: string): string {
  return path.join(path.dirname(logDir), 'versions');
}

export async function resolveArticleVersionsDir(): Promise<string> {
  const fromEnv = process.env.ARTICLE_VERSIONS_DIR?.trim();
  if (fromEnv) {
    const p = path.resolve(fromEnv);
    await fs.mkdir(p, { recursive: true });
    return p;
  }

  // 内容目录被显式改道时，版本库必须跟着改道（测试隔离的硬前提）
  const contentLogOverride = process.env.CONTENT_LOG_DIR?.trim();
  if (contentLogOverride) {
    const versionsDir = versionsSiblingOf(path.resolve(contentLogOverride));
    await fs.mkdir(versionsDir, { recursive: true });
    return versionsDir;
  }

  const cwdCandidates = [
    path.resolve(process.cwd(), 'content/log'),
    path.resolve(process.cwd(), '../../content/log'),
    path.resolve(process.cwd(), '../content/log'),
  ];
  for (const logDir of cwdCandidates) {
    try {
      await fs.access(logDir);
      const versionsDir = versionsSiblingOf(logDir);
      await fs.mkdir(versionsDir, { recursive: true });
      return versionsDir;
    } catch {
      /* next */
    }
  }
  throw new Error('article-versions-dir-unavailable');
}
