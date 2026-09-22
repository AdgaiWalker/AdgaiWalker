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
/** 知识图谱产物（PRD-KNOWLEDGE-GRAPH §5.1）：web / api / agent 共读一份 */
export const graphJsonPath = path.join(webGeneratedDir, 'graph.json');
/**
 * 代码图谱产物（PRD-CODE-GRAPH）：**公开面**，只有节点与边（web 静态引入）。
 * 体检明细刻意不放这里 —— 它会被打进公开 bundle，而公开面不披露「哪里烂」。
 */
export const codeGraphJsonPath = path.join(webGeneratedDir, 'codegraph.json');
/**
 * 代码图谱体检产物：**内部面**，只有门禁与 admin（经 api）读。
 * web 从不引入本文件，所以它的内容物理上进不了公开 bundle。
 */
export const codeGraphHealthJsonPath = path.join(
  webGeneratedDir,
  'codegraph-health.json',
);
export const webDistDir = path.join(repoRoot, 'apps/web/dist');
/** 架构门禁的基线（已知债务快照，**不是**架构真相 —— 见 PRD-CODE-GRAPH §门禁策略） */
export const architectureBaselinePath = path.join(repoRoot, 'scripts/architecture-baseline.json');
export const apiEnvPath = path.join(repoRoot, 'apps/api/.env');
export const tmpDir = path.join(repoRoot, 'tmp');
export const dualEntryPath = path.join(repoRoot, 'apps/web/src/shared/dual-entry.ts');
export const walkerCssPath = path.join(repoRoot, 'apps/web/src/styles/walker.css');

export function fromRoot(...segments: string[]): string {
  return path.join(repoRoot, ...segments);
}
