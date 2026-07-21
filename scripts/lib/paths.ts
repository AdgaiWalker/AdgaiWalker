/**
 * paths — 仓库内脚本路径的唯一真相源
 * 依赖：node:path / node:url
 * 被调用：generate-content / build-web / prerender / accept / verify 等
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** scripts/lib → 仓库根 */
export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export const contentLogDir = path.join(repoRoot, 'content/log');
export const webGeneratedDir = path.join(repoRoot, 'apps/web/src/generated');
export const contentJsonPath = path.join(webGeneratedDir, 'content.json');
export const webDistDir = path.join(repoRoot, 'apps/web/dist');
export const apiEnvPath = path.join(repoRoot, 'apps/api/.env');
export const tmpDir = path.join(repoRoot, 'tmp');
export const dualEntryPath = path.join(repoRoot, 'apps/web/src/shared/dual-entry.ts');
export const walkerCssPath = path.join(repoRoot, 'apps/web/src/styles/walker.css');

export function fromRoot(...segments: string[]): string {
  return path.join(repoRoot, ...segments);
}
