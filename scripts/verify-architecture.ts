/**
 * verify:architecture —— 代码结构体检门禁（PRD-CODE-GRAPH §门禁策略）
 * 依赖：code-extract（与 code:gen 同一份抽取实现）、shared 的债务对账、paths
 * 触发：pnpm verify:architecture（build:web 链上，紧随 code:gen）
 *
 * 只报**机器自证**的四条硬伤，不读任何人工规则表：环依赖 / 解析不到的 import /
 * 从真实入口不可达的死文件 / packages 反向依赖 apps。一份写着「controller 不得导入
 * adapter」的规则文件其实是重述 `docs/ARCHITECTURE.md` 已声明过的同一件事 —— 那会成为
 * 第二个真相源，而这四条的证据全在代码与清单自身。
 *
 * 处置：分等级 + 基线棘轮。
 * - 硬伤计入基线；**新增即失败**，要靠 `--update-baseline` 显式承认
 * - 风格项（超级枢纽、超大文件）只告警，不进基线：430 个文件的老库首日必然一堆，
 *   记进基线只会掩盖信号
 *
 * 刻意**重新抽取**而不是读 `codegraph-health.json`：读产物的话，产物过期就会静默放行。
 * 对账口径（谁和谁是同一条债务）在 shared 的 `diffCodeDebt`，与 admin 内部视图共用一份。
 */
import fs from 'node:fs';
import {
  CODE_GRAPH_SCHEMA_VERSION,
  parseArchitectureBaseline,
  type ArchitectureBaseline,
} from '../packages/shared/src/code-artifact';
import { LARGE_FILE_LINES } from '../packages/shared/src/code-graph';
import {
  acceptedDebtFromHealth,
  diffCodeDebt,
  type AcceptedCodeDebt,
  type CodeDebtCategory,
} from '../packages/shared/src/code-debt';
import { extractCodeGraph } from './lib/code-extract';
import { architectureBaselinePath } from './lib/paths';

const CATEGORY_LABELS: Record<CodeDebtCategory, string> = {
  cycles: '环依赖',
  unresolved: '解析不到的引用',
  unreachable: '不可达死文件',
  reverseDependencies: '反向依赖',
};

/** 按**显示宽度**补空格：中文按 2 列算，否则报告的表格会歪 */
function padEnd(text: string, width: number): string {
  let display = 0;
  for (const char of text) {
    display += /[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(char) ? 2 : 1;
  }
  return text + ' '.repeat(Math.max(0, width - display));
}

/**
 * 读基线，走 shared 的契约层解析：不存在 / 形状不对 / 版本不匹配三种情况分开说清，
 * 不再笼统地当「没基线」（后者会误导人去跑 --update-baseline，把坏文件原样覆盖掉）。
 */
function loadBaseline():
  | { ok: true; baseline: ArchitectureBaseline }
  | { ok: false; missing: boolean; reason: string } {
  let text: string;
  try {
    text = fs.readFileSync(architectureBaselinePath, 'utf8');
  } catch {
    return { ok: false, missing: true, reason: '基线不存在' };
  }
  const parsed = parseArchitectureBaseline(JSON.parse(text));
  if (!parsed.ok) return { ok: false, missing: false, reason: parsed.reason };
  return { ok: true, baseline: parsed.value };
}

const isUpdate = process.argv.includes('--update-baseline');
const extraction = extractCodeGraph();
const { health } = extraction;
const current = acceptedDebtFromHealth(health);
const total = (debt: AcceptedCodeDebt): number =>
  debt.cycles.length +
  debt.unresolved.length +
  debt.unreachable.length +
  debt.reverseDependencies.length;

const baseline = loadBaseline();

if (isUpdate) {
  fs.writeFileSync(
    architectureBaselinePath,
    `${JSON.stringify(
      {
        schemaVersion: CODE_GRAPH_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        sourceCommit: extraction.sourceCommit,
        accepted: current,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `\n已把当前 ${total(current)} 条结构硬伤记为已知债务 → scripts/architecture-baseline.json\n`,
  );
  for (const category of Object.keys(CATEGORY_LABELS) as CodeDebtCategory[]) {
    console.log(`  ${CATEGORY_LABELS[category]}  ${current[category].length}`);
  }
  console.log('');
  console.log('提醒：基线是「已知债务快照」，不是「这些东西没问题」。');
  console.log('它只保证不再变多；要还债就修掉代码，再跑一次 --update-baseline 收敛。\n');
  process.exit(0);
}

if (!baseline.ok) {
  console.error(
    baseline.missing
      ? `\n✗ 基线不存在：${architectureBaselinePath}\n` +
          `  先跑 pnpm verify:architecture --update-baseline 把当前存量记为已知债务。\n`
      : `\n✗ 基线读不出来（不覆盖它，防止把坏文件原样承认）：\n  ${baseline.reason}\n` +
          `  删掉后重跑 pnpm verify:architecture --update-baseline 可重建。\n`,
  );
  process.exit(1);
}
const baselineDebt = baseline.baseline.accepted;

const diff = diffCodeDebt(current, baselineDebt);

console.log(`\n代码结构体检（verify:architecture）`);
console.log(`  来源 commit ${extraction.sourceCommit || '(非 Git 环境)'}`);
console.log(`\n硬伤（新增即失败）`);
for (const entry of diff.categories) {
  console.log(
    `  ${padEnd(CATEGORY_LABELS[entry.category], 18)}` +
      ` 基线 ${String(entry.accepted).padStart(3)}` +
      `    本次 ${String(entry.current).padStart(3)}` +
      `    新增 ${entry.added}`,
  );
}

// 风格项：只告警。它们不进基线，所以每次都会如实列出。
console.log(`\n风格项（只告警，不进基线）`);
console.log(`  超大文件 ≥${LARGE_FILE_LINES} 行  ${health.largeFiles.length} 个`);
for (const file of health.largeFiles.slice(0, 5)) {
  console.log(`    ${file.lines.toString().padStart(5)} 行  ${file.path}`);
}
if (health.largeFiles.length > 5) {
  console.log(`    … 还有 ${health.largeFiles.length - 5} 个`);
}
console.log(`  超级枢纽 前 5（按真实依赖度数）`);
for (const hub of health.hubs.slice(0, 5)) {
  console.log(`    ${hub.linkDegree.toString().padStart(4)} 度  ${hub.path}`);
}
// 降级证据：提名无效的文件。不是硬伤也不进基线，但报告必须如实列出 —— 不静默丢信息。
if (health.nominated.length > 0) {
  console.log(`  被提名但提名者不可达 ${health.nominated.length} 个（提名不作为可达证据）`);
  for (const item of health.nominated.slice(0, 5)) {
    console.log(`    ${item.path}  ← ${item.nominatedBy.join('、')}`);
  }
}

if (diff.resolved.length > 0) {
  console.log(`\n已还清 ${diff.resolved.length} 条（基线里已不存在）：`);
  for (const item of diff.resolved) {
    console.log(`  - [${CATEGORY_LABELS[item.category]}] ${item.detail}`);
  }
  console.log(`  运行 pnpm verify:architecture --update-baseline 收敛基线。`);
}

if (diff.added.length > 0) {
  console.error(`\n✗ 新增 ${diff.added.length} 条结构硬伤（基线只减不增）：`);
  for (const item of diff.added) {
    console.error(`  [${CATEGORY_LABELS[item.category]}] ${item.detail}`);
  }
  console.error(
    `\n这些不是已知债务。修掉它们；确属既有情况时，` +
      `用 pnpm verify:architecture --update-baseline 显式承认。\n`,
  );
  process.exit(1);
}

console.log(
  `\n✓ 通过：没有新增结构硬伤（已知债务 ${total(baselineDebt)} 条，见 scripts/architecture-baseline.json）\n`,
);
