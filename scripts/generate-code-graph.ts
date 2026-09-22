/**
 * generate-code-graph — 扫描源码 → `apps/web/src/generated/codegraph.json`（+ 体检产物）
 * 依赖：code-extract（唯一抽取实现）、paths
 * 触发：pnpm code:gen
 *
 * 产物分两份，因为**受众不同**（PRD-CODE-GRAPH §公开面边界）：
 * - codegraph.json        只有节点与边 → web 静态引入、随页面公开
 * - codegraph-health.json 体检明细       → 只有门禁与 admin 读，web 从不引入
 */
import path from 'node:path';
import { LARGE_FILE_LINES } from '../packages/shared/src/code-graph';
import { extractCodeGraph, writeCodeGraphArtifacts } from './lib/code-extract';
import { codeGraphHealthJsonPath, codeGraphJsonPath, repoRoot } from './lib/paths';

/** 列表打印上限：体检可能很长，报告要能一眼看完（完整清单在产物里） */
const LIST_LIMIT = 20;

function printList(label: string, items: readonly string[]): void {
  if (items.length === 0) return;
  console.log(`  ${label}（${items.length}）`);
  for (const item of items.slice(0, LIST_LIMIT)) console.log(`    · ${item}`);
  if (items.length > LIST_LIMIT) console.log(`    … 还有 ${items.length - LIST_LIMIT} 条`);
}

function relative(file: string): string {
  return path.relative(repoRoot, file);
}

const extraction = extractCodeGraph();
const { graph, health, stats } = extraction;

const nodeCounts = graph.nodes.reduce<Record<string, number>>((acc, node) => {
  acc[node.kind] = (acc[node.kind] ?? 0) + 1;
  return acc;
}, {});
const edgeCounts = graph.edges.reduce<Record<string, number>>((acc, edge) => {
  acc[edge.kind] = (acc[edge.kind] ?? 0) + 1;
  return acc;
}, {});

const counts = (record: Record<string, number>): string =>
  Object.entries(record)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([kind, total]) => `${kind} ${total}`)
    .join(' / ');

console.log(`\n代码图谱：${graph.nodes.length} 节点 / ${graph.edges.length} 边`);
console.log(`  节点    ${counts(nodeCounts)}`);
console.log(`  边      ${counts(edgeCounts)}`);
console.log(
  `  引用    ${stats.importStatements} 条（其中外部包 ${stats.external} 条，照 Obsidian「外链不算边」不建边）`,
);
console.log(`  扫描面  ${stats.scanned} 个源文件；解析目标池 ${stats.resolveTargets} 个仓库文件`);
console.log(`  入口    ${stats.entries} 个（来自 package.json 脚本 / index.html / 包根配置 / 测试命名约定）`);

console.log(`\n体检`);
console.log(`  环依赖          ${health.cycles.length}`);
console.log(`  解析不到的引用  ${health.unresolved.length}`);
console.log(`  不可达死文件    ${health.unreachable.length}`);
console.log(`  反向依赖        ${health.reverseDependencies.length}`);

for (const cycle of health.cycles.slice(0, LIST_LIMIT)) {
  console.log(`    ↻ ${cycle.join(' → ')}`);
}
if (health.cycles.length > LIST_LIMIT) {
  console.log(`    … 还有 ${health.cycles.length - LIST_LIMIT} 条`);
}
printList(
  '解析不到的引用',
  health.unresolved.map(
    (item) => `${item.specifier}  ← ${item.importers.join('、')}`,
  ),
);
printList('不可达死文件', health.unreachable);
printList(
  '反向依赖（packages → apps）',
  health.reverseDependencies.map((item) => `${item.from} → ${item.to}`),
);

// 不可达按目录归堆：用来一眼看出是「真死代码」还是「某类入口没建模」
if (health.unreachable.length > 0) {
  const byGroup = new Map<string, number>();
  for (const file of health.unreachable) {
    const parts = file.split('/');
    const group = parts[0] === 'apps' || parts[0] === 'packages'
      ? `${parts[0]}/${parts[1]}/${parts[2] ?? ''}`
      : (parts[0] ?? file);
    byGroup.set(group, (byGroup.get(group) ?? 0) + 1);
  }
  console.log(`  按目录分组：`);
  for (const [group, total] of [...byGroup.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${total.toString().padStart(4)}  ${group}`);
  }
}

console.log(`\n超级枢纽（风格项，只告警不进基线）`);
for (const hub of health.hubs) console.log(`  ${hub.linkDegree.toString().padStart(4)}  ${hub.path}`);

console.log(`\n超大文件（≥${LARGE_FILE_LINES} 行，风格项，只告警不进基线）`);
for (const file of health.largeFiles) {
  console.log(`  ${file.lines.toString().padStart(5)} 行  ${file.path}`);
}

// 降级证据：这些文件被路径字符串提名过，但提名者自己不可达 —— 提名无效。
// 记账不判定：报告如实列出，让人能审「启发式有没有在掩盖真死文件」。
if (health.nominated.length > 0) {
  console.log(`\n被提名但提名者不可达（提名不作为可达证据，仅记账）`);
  for (const item of health.nominated.slice(0, LIST_LIMIT)) {
    console.log(`  ${item.path}  ← ${item.nominatedBy.join('、')}`);
  }
  if (health.nominated.length > LIST_LIMIT) {
    console.log(`  … 还有 ${health.nominated.length - LIST_LIMIT} 条`);
  }
}

const written = writeCodeGraphArtifacts(extraction);
const writeNote = (did: boolean) => (did ? '已写入' : '未变，保留原文件');
console.log(`\n${writeNote(written.graphWritten)}  ${relative(codeGraphJsonPath)}`);
console.log(`${writeNote(written.healthWritten)}  ${relative(codeGraphHealthJsonPath)}`);
console.log(`来源 commit ${extraction.sourceCommit || '(非 Git 环境)'}\n`);
