/**
 * 代码图谱数据门面 —— 绑定 gen 产物，向页面暴露代码结构图。
 * 运行时只读 `generated/codegraph.json`（禁止在 web 里做 fs）。
 * 产物契约见 docs/PRD-CODE-GRAPH.md。
 *
 * **为什么是动态 import**：产物 gzip 约 20KB，静态引入会进主包、让**全部**页面
 * 都背上它，而只有 `/architecture` 用它。所以这里交出的是 Promise，由页面在挂载后取。
 *
 * 体检产物（`codegraph-health.json`）**刻意不出现在这里**：它是内部面，
 * 只给门禁与 admin 读，web 从不引入 —— 于是它物理上进不了公开 bundle。
 */
import type { CodeGraph } from '@walker/shared';

let cache: Promise<CodeGraph> | null = null;

/** 取代码图谱产物（首次调用后缓存同一个 Promise，重复挂载不会重复下载） */
export function loadCodeGraph(): Promise<CodeGraph> {
  cache ??= import('./generated/codegraph.json').then(
    (module) => module.default as unknown as CodeGraph,
  );
  return cache;
}
