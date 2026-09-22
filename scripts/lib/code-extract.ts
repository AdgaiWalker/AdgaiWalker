/**
 * 代码图谱抽取 —— **gen 与门禁共用的唯一实现**（两个调用方，一份口径）。
 *
 * 分工：解析规则在 `@walker/shared/code-resolve`（纯函数、可单测），
 * 语法抽取在 `packages/shared/src/code-imports`，建模与体检在 `code-graph`。
 * 本文件只做**这段 IO**：走目录、读清单、读源码、落产物。
 *
 * ## 节点范围
 * 图面节点 = 源码文件：apps/<pkg>/src、packages/<pkg>/src、scripts（含其中的 css / json）。
 * 包的**根级配置文件**（vite/vitest.config.ts 等）**不进图面** —— 它们不是模块图的一环，
 * 但确是事实来源：用来判定「谁被直接执行」，见 `collectEntries`。
 *
 * ## 为什么排除 .d.ts
 * 环境声明按定义没有任何人去 import，若不排除会成批变成假死文件。
 *
 * ## 可达性为什么需要「按名引用」
 * 本仓有一批文件不是被 import 的，而是被**按名执行**的：
 * `tsx scripts/prerender-web.ts`（字符串参数）、`setupFiles: ['./src/test/setup.ts']`、
 * `new URL('./graph.worker.ts', import.meta.url)`（Vite worker 的唯一写法）。
 * 不建模这几类，第一份体检报告就会满屏假死文件。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  CODE_GRAPH_SCHEMA_VERSION,
  codeGraphCounts,
  type CodeGraphArtifact,
  type CodeGraphHealthArtifact,
} from '../../packages/shared/src/code-artifact';
import {
  buildCodeGraph,
  inspectCodeGraph,
  type CodeGraph,
  type CodeGraphHealth,
  type CodeImport,
  type CodeSourceFile,
} from '../../packages/shared/src/code-graph';
import { parseCodeFile } from '../../packages/shared/src/code-imports';
import {
  resolveCodeSpecifier,
  type ResolveContext,
  type WorkspacePackage,
} from '../../packages/shared/src/code-resolve';
import { loadRepoCreatedDates } from './git-created';
import {
  codeGraphHealthJsonPath,
  codeGraphJsonPath,
  repoRoot,
} from './paths';

const CODE_SOURCE = /\.(ts|tsx|mts|cts)$/i;
/** 环境声明：不是模块图的一环，且必然「无人引用」 */
const DECLARATION = /\.d\.ts$/i;
/** 测试运行器按命名约定发现（各 vitest.config 的 include 皆为 `src/**\/*.test.ts*`） */
const TEST_FILE = /\.(test|spec)\.(ts|tsx|mts|cts)$/i;
/** 包根级配置文件：事实来源，不是图面节点 */
const CONFIG_FILE = /\.(ts|mts|cts)$/i;
/** 不参与遍历的目录（构建产物、依赖、临时区） */
const PRUNE_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'tmp', '__pycache__']);

function toRepoPath(absolute: string): string {
  return path.relative(repoRoot, absolute).split(path.sep).join('/');
}

/** 行数。末行没有换行也算一行（比 `wc -l` 更符合「这文件有多长」的直觉） */
function countLines(text: string): number {
  let total = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) total += 1;
  }
  return text.length > 0 && !text.endsWith('\n') ? total + 1 : total;
}

/** 仓库内全部文件（相对仓库根 POSIX），供解析探测用 */
function listRepoFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      // 点目录（.git / .vercel / .codebuddy…）一律不进解析面
      if (entry.name.startsWith('.')) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!PRUNE_DIRS.has(entry.name)) walk(absolute);
        continue;
      }
      if (entry.isFile()) out.push(toRepoPath(absolute));
    }
  };
  walk(repoRoot);
  return out;
}

/** 工作区目录：apps/<name> 与 packages/<name> */
function workspaceDirs(): Array<{ dir: string; manifest: string }> {
  const out: Array<{ dir: string; manifest: string }> = [];
  for (const group of ['apps', 'packages']) {
    const base = path.join(repoRoot, group);
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base).sort()) {
      const dir = path.join(base, name);
      const manifest = path.join(dir, 'package.json');
      if (fs.statSync(dir).isDirectory() && fs.existsSync(manifest)) {
        out.push({ dir: toRepoPath(dir), manifest });
      }
    }
  }
  return out;
}

/** 图面节点所在的目录：apps/<pkg>/src、packages/<pkg>/src、scripts */
function scanRoots(): string[] {
  const roots = workspaceDirs()
    .map(({ dir }) => `${dir}/src`)
    .filter((dir) => fs.existsSync(path.join(repoRoot, dir)));
  if (fs.existsSync(path.join(repoRoot, 'scripts'))) roots.push('scripts');
  return roots;
}

type Manifest = {
  name?: string;
  main?: string;
  types?: string;
  exports?: Record<string, unknown> | string;
  scripts?: Record<string, string>;
};

function readManifest(file: string): Manifest | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest;
  } catch {
    return null;
  }
}

/** `./dist/index.js` → `packages/shared/src/index.ts`（构建产物路径映射回源码） */
function entryToSource(dir: string, target: string): string | null {
  const clean = target.replace(/^\.\//, '');
  if (!clean.startsWith('dist/')) return null;
  const source = clean
    .replace(/^dist\//, 'src/')
    .replace(/\.(d\.ts|d\.mts|ts|mts|cts|js|mjs|cjs)$/i, '.ts');
  return `${dir}/${source}`;
}

/** 从 `exports` 取值里挑出可映射回源码的候选路径 */
function exportTargets(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value as Record<string, unknown>).filter(
    (item): item is string => typeof item === 'string',
  );
}

/** 由各包的 package.json 建「包名 → 入口候选」映射（tsconfig 的 paths 是空的，只能走这里） */
function workspacePackages(): Map<string, WorkspacePackage> {
  const map = new Map<string, WorkspacePackage>();
  for (const { dir, manifest: manifestPath } of workspaceDirs()) {
    const manifest = readManifest(manifestPath);
    if (!manifest?.name) continue;

    const entries: string[] = [];
    for (const target of [manifest.main, manifest.types]) {
      if (target) {
        const source = entryToSource(dir, target);
        if (source) entries.push(source);
      }
    }
    if (typeof manifest.exports === 'string') {
      const source = entryToSource(dir, manifest.exports);
      if (source) entries.push(source);
    } else if (manifest.exports && typeof manifest.exports === 'object') {
      for (const [key, value] of Object.entries(manifest.exports)) {
        if (key !== '.') continue;
        for (const target of exportTargets(value)) {
          const source = entryToSource(dir, target);
          if (source) entries.push(source);
        }
      }
    }
    // 兜底：没有可映射的入口时按惯例取 src/index.ts（探测阶段自会核对是否存在）
    if (entries.length === 0) entries.push(`${dir}/src/index.ts`);

    map.set(manifest.name, { dir, entries: [...new Set(entries)] });
  }
  return map;
}

/** 解析上下文：仓库全部文件 + 包映射 */
function resolveContext(files: readonly string[]): ResolveContext {
  return { files: new Set(files), workspacePackages: workspacePackages() };
}

/**
 * 入口集合（可达性的根）—— 全部来自事实，不含任何人工规则：
 * 1. package.json 的脚本命令里写明的 `*.ts`
 * 2. index.html 的 `<script src>`（vite 应用入口）
 * 3. 包根配置文件里的相对引用：既覆盖 `import`，也覆盖 `setupFiles: ['./src/test/setup.ts']`
 *    （它只以字符串出现）与 `tsx scripts/xxx.ts` 这类按名执行
 * 4. 测试文件：测试运行器按命名约定发现，并非被谁 import
 */
function collectEntries(
  allFiles: ReadonlySet<string>,
  context: ResolveContext,
): Set<string> {
  const entries = new Set<string>();

  const addIfFile = (candidate: string | null): void => {
    if (candidate && allFiles.has(candidate)) entries.add(candidate);
  };

  /** 把一段代码里「像路径的字符串」尽可能落到真实文件上 */
  const addNamedRefs = (from: string, texts: readonly string[]): void => {
    for (const text of texts) {
      // 仓库根相对写法（`scripts/prerender-web.ts`）优先，再试相对/包名解析
      if (allFiles.has(text)) {
        entries.add(text);
        continue;
      }
      addIfFile(resolveCodeSpecifier(text, from, context).target);
    }
  };

  // 1) package.json 脚本。注意：脚本里的路径是**相对该包目录**的（`apps/api` 的
  //    `tsx watch ... src/main.ts` 指的是 `apps/api/src/main.ts`，不是仓库根的 `src/`），
  //    按仓库根解析会让整个 api 应用变成假死代码。
  const scriptTokens = /[\w./@-]+\.(?:ts|tsx|mts|cts)\b/g;
  const manifests = [path.join(repoRoot, 'package.json')].concat(
    workspaceDirs().map(({ manifest }) => manifest),
  );
  for (const manifestPath of manifests) {
    const manifest = readManifest(manifestPath);
    const manifestDir = toRepoPath(path.dirname(manifestPath));
    const from = manifestDir ? `${manifestDir}/package.json` : 'package.json';
    for (const command of Object.values(manifest?.scripts ?? {})) {
      for (const match of command.matchAll(scriptTokens)) {
        addNamedRefs(from, [match[0].startsWith('.') ? match[0] : `./${match[0]}`]);
      }
    }
  }

  // 2) index.html 的模块脚本（`/src/main.tsx` 是相对该 html 所在目录，不是仓库根）
  for (const { dir } of workspaceDirs()) {
    const htmlPath = path.join(repoRoot, dir, 'index.html');
    if (!fs.existsSync(htmlPath)) continue;
    const html = fs.readFileSync(htmlPath, 'utf8');
    for (const match of html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) {
      const src = (match[1] ?? '').trim();
      if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) continue;
      addNamedRefs(`${dir}/index.html`, [`./${src.replace(/^\//, '')}`]);
    }
  }

  // 3) 包根配置文件（事实来源，不是图面节点）
  for (const { dir } of workspaceDirs()) {
    for (const name of fs.readdirSync(path.join(repoRoot, dir)).sort()) {
      if (!CONFIG_FILE.test(name)) continue;
      const configPath = `${dir}/${name}`;
      if (!allFiles.has(configPath)) continue;
      const parsed = parseCodeFile(
        fs.readFileSync(path.join(repoRoot, configPath), 'utf8'),
        configPath,
      );
      for (const entry of parsed.imports) {
        addIfFile(resolveCodeSpecifier(entry.specifier, configPath, context).target);
      }
      addNamedRefs(configPath, parsed.pathLikeStrings);
    }
  }

  // 4) 测试文件（命名约定发现）
  for (const file of allFiles) if (TEST_FILE.test(file)) entries.add(file);

  return entries;
}

export type CodeExtraction = {
  graph: CodeGraph;
  health: CodeGraphHealth;
  /** 落产物时的来源标记 */
  sourceCommit: string;
  stats: {
    scanned: number;
    resolveTargets: number;
    importStatements: number;
    external: number;
    entries: number;
  };
};

function sourceCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    /* 非 Git 环境（打包机）→ 空串，产物照常可写 */
    return '';
  }
}

/** 抽取整张代码图谱与体检结果 */
export function extractCodeGraph(): CodeExtraction {
  const allFiles = listRepoFiles();
  const context = resolveContext(allFiles);
  const allFileSet = new Set(allFiles);

  const artifactPaths = new Set([
    toRepoPath(codeGraphJsonPath),
    toRepoPath(codeGraphHealthJsonPath),
  ]);
  const roots = scanRoots();
  const scanned = allFiles
    .filter((file) => roots.some((root) => file.startsWith(`${root}/`)))
    .filter((file) => !DECLARATION.test(file) && !artifactPaths.has(file))
    .sort();

  const createdDates = loadRepoCreatedDates(roots);
  const namedRefs: Array<{ from: string; text: string }> = [];

  let importStatements = 0;
  let external = 0;
  const files: CodeSourceFile[] = [];

  for (const file of scanned) {
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    const lines = countLines(source);
    if (!CODE_SOURCE.test(file)) {
      files.push({ path: file, created: createdDates.get(file) ?? '', lines, imports: [] });
      continue;
    }
    const parsed = parseCodeFile(source, file);
    const imports: CodeImport[] = [];
    // 静态与动态 import、worker/资源 URL 引用一视同仁：都是真实依赖
    const specifiers = [
      ...parsed.imports,
      ...parsed.assetRefs.map((specifier) => ({ specifier, form: 'static' as const })),
    ];
    for (const { specifier, form } of specifiers) {
      importStatements += 1;
      const resolved = resolveCodeSpecifier(specifier, file, context);
      if (resolved.outcome === 'external') {
        external += 1;
        continue;
      }
      imports.push({
        specifier,
        form,
        outcome: resolved.outcome,
        target: resolved.target,
      });
    }
    // 按名引用只从非测试文件取：测试里的路径字符串多是夹具，不是执行依据
    if (!TEST_FILE.test(file)) {
      for (const text of parsed.pathLikeStrings) namedRefs.push({ from: file, text });
    }
    files.push({ path: file, created: createdDates.get(file) ?? '', lines, imports });
  }

  const entries = collectEntries(allFileSet, context);
  // 可达性收敛（问题 6 的根因处）：字符串提名只从**可达文件**向外传播，迭代到不动点。
  // 拍平成一个集合的话，一个死文件里的路径字符串就能给另一个死文件「续命」，
  // 把死文件体检整体架空。提名者不可达的提名**不丢弃** —— 记入 nominations，
  // 由体检产出 nominated 一栏如实呈现（降级证据，可审计）。
  const nominatedBy = new Map<string, Set<string>>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const { from, text } of namedRefs) {
      const target = allFileSet.has(text)
        ? text
        : resolveCodeSpecifier(text, from, context).target;
      // 提名只为**代码文件**的可达性服务：json / css 等由附件边建模，
      // 记进来只会让「降级证据」一栏被数据文件引用淹没。
      if (!target || !allFileSet.has(target) || !CODE_SOURCE.test(target)) continue;
      if (entries.has(from)) {
        if (!entries.has(target)) {
          entries.add(target);
          changed = true;
        }
      } else if (!entries.has(target)) {
        (nominatedBy.get(target) ?? nominatedBy.set(target, new Set()).get(target)!).add(from);
      }
    }
  }
  const nominations = new Map<string, string[]>();
  for (const [target, by] of nominatedBy) nominations.set(target, [...by]);

  const graph = buildCodeGraph({ files, now: new Date().toISOString() });
  const health = inspectCodeGraph(graph, {
    entries: [...entries].sort(),
    nominations,
  });

  return {
    graph,
    health,
    sourceCommit: sourceCommit(),
    stats: {
      scanned: scanned.length,
      resolveTargets: allFiles.length,
      importStatements,
      external,
      entries: health.entries.length,
    },
  };
}

/** 写出两份产物；内容未变则不重写（保持 git 干净，与 graph.json 同一处理） */
export function writeCodeGraphArtifacts(extraction: CodeExtraction): {
  graphWritten: boolean;
  healthWritten: boolean;
} {
  const { graph, health, sourceCommit: commit } = extraction;
  const graphArtifact: CodeGraphArtifact = {
    schemaVersion: CODE_GRAPH_SCHEMA_VERSION,
    ...graph,
  };
  const healthArtifact: CodeGraphHealthArtifact = {
    ...health,
    schemaVersion: CODE_GRAPH_SCHEMA_VERSION,
    sourceCommit: commit,
    generatedAt: new Date().toISOString(),
    // 唯一口径计数：admin 的「依赖边」与访客页的「内部引用」从此必然同数
    counts: codeGraphCounts(graph),
  };

  const graphPayload = (value: unknown) => {
    const { schemaVersion, nodes, edges } = value as CodeGraphArtifact;
    return { schemaVersion, nodes, edges };
  };
  const healthPayload = (value: unknown) => {
    const { generatedAt: _ignored, ...rest } = value as CodeGraphHealthArtifact;
    return rest;
  };

  return {
    graphWritten: writeIfChanged(codeGraphJsonPath, graphArtifact, graphPayload),
    healthWritten: writeIfChanged(codeGraphHealthJsonPath, healthArtifact, healthPayload),
  };
}

/**
 * 内容未变则不重写：保持 git 干净，且 `generatedAt` 会停在「最后一次有意义的变更」
 * 时刻而不是每次 gen 都跳（与 `graph.json` 同一处理）。
 */
function writeIfChanged(
  file: string,
  next: unknown,
  payloadOf: (value: unknown) => unknown,
): boolean {
  try {
    const existing: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (JSON.stringify(payloadOf(existing)) === JSON.stringify(payloadOf(next))) {
      return false;
    }
  } catch {
    /* 无旧文件或旧文件损坏 → 正常写入 */
  }
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return true;
}
