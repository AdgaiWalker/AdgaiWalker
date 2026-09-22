/**
 * 代码图谱的模块解析 —— 纯函数，无 IO（文件集合与包映射由调用方提供）。
 *
 * 为什么不放在 scripts：本仓 scripts 只有 `typecheck:scripts`、**没有测试运行器**，
 * 而解析口径决定幽灵节点的真假（漏一条规则就是成百上千个假幽灵），必须可单测。
 * scripts 侧只负责「走目录拿文件列表 + 读 package.json 建映射」这段 IO。
 *
 * 与 Obsidian 语义一致：只有仓库内部的引用算边；外部包（react / node:fs）不是边。
 */

export type SpecifierKind = 'relative' | 'workspace' | 'external';

/** `code` = 代码文件（笔记）；`attachment` = 非代码文件；`external` = 不建边 */
export type ResolutionOutcome = 'code' | 'attachment' | 'external' | 'unresolved';

/** workspace 包：包名 → 位置与入口候选（由 scripts 读 package.json 构建） */
export type WorkspacePackage = {
  /** 包根目录（相对仓库根），如 `packages/shared` */
  dir: string;
  /** 根入口候选（来自 `exports` / `main` 映射到源码路径） */
  entries: readonly string[];
  /** 声明的子路径导出：`./content-load` → 候选文件 */
  subpaths?: ReadonlyMap<string, readonly string[]>;
};

export type ResolveContext = {
  /** 仓库内已知文件（相对仓库根、POSIX 分隔） */
  files: ReadonlySet<string>;
  workspacePackages: ReadonlyMap<string, WorkspacePackage>;
};

export type ResolvedImport = {
  specifier: string;
  kind: SpecifierKind;
  outcome: ResolutionOutcome;
  /** outcome 为 code / attachment 时的目标相对路径 */
  target: string | null;
};

const CODE_EXTENSIONS = /\.(ts|tsx|mts|cts)$/i;
/** 需要把 ESM 的 `.js` 说明符映射回源码后缀（本仓 55 处 `from './x.js'`） */
const EMITTED_EXTENSIONS = /\.(js|mjs|cjs)$/i;
/** 探测顺序：精确 → `.ts` → `.tsx` → `/index.ts` → `/index.tsx` */
const PROBE_SUFFIXES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'] as const;

function dirname(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut === -1 ? '' : path.slice(0, cut);
}

/**
 * POSIX 归一化。越过仓库根（`..` 多于层级）返回 `'..'` 作为哨兵，
 * 调用方据此判为解析不到——不无限向外探测。
 */
export function normalizeRepoPath(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return '..';
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

/** 取说明符的包名：`@scope/name/sub` → `@scope/name`；`name/sub` → `name` */
function packageNameOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? '');
}

/** 取 scope：`@walker/shared` → `@walker`；非 scoped 包 → null */
function scopeOf(packageName: string): string | null {
  return packageName.startsWith('@') ? (packageName.split('/')[0] ?? null) : null;
}

function outcomeForFile(file: string): ResolutionOutcome {
  return CODE_EXTENSIONS.test(file) ? 'code' : 'attachment';
}

/** 在候选路径上按后缀顺序探测真实文件；找不到返回 null */
function probe(
  candidates: readonly string[],
  files: ReadonlySet<string>,
): { target: string; outcome: ResolutionOutcome } | null {
  for (const candidate of candidates) {
    // `.js` 说明符要映射回源码后缀：先去掉产物后缀，再交给后缀探测补 `.ts` / `.tsx`
    const variants = EMITTED_EXTENSIONS.test(candidate)
      ? [candidate, candidate.replace(EMITTED_EXTENSIONS, '')]
      : [candidate];
    for (const variant of variants) {
      for (const suffix of PROBE_SUFFIXES) {
        const file = variant + suffix;
        if (files.has(file)) return { target: file, outcome: outcomeForFile(file) };
      }
    }
  }
  return null;
}

/**
 * 解析一条 import 说明符。
 *
 * - 相对路径 → 归一化后探测；写错即 `unresolved`
 * - workspace 包 → 先查声明的子路径导出，再回落 `包目录/src/<子路径>`
 * - 其他裸包名 → `external`（不建节点也不建边）
 */
export function resolveCodeSpecifier(
  specifier: string,
  fromPath: string,
  context: ResolveContext,
): ResolvedImport {
  const cleaned = specifier.split('?')[0]!.split('#')[0]!.trim();
  if (!cleaned) {
    return { specifier, kind: 'external', outcome: 'external', target: null };
  }

  if (cleaned.startsWith('./') || cleaned.startsWith('../') || cleaned === '.' || cleaned === '..') {
    const base = dirname(fromPath);
    const normalized = normalizeRepoPath(base ? `${base}/${cleaned}` : cleaned);
    if (!normalized || normalized === '..') {
      return { specifier, kind: 'relative', outcome: 'unresolved', target: null };
    }
    const hit = probe([normalized], context.files);
    return {
      specifier,
      kind: 'relative',
      outcome: hit?.outcome ?? 'unresolved',
      target: hit?.target ?? null,
    };
  }

  const name = packageNameOf(cleaned);
  const pkg = context.workspacePackages.get(name);
  if (!pkg) {
    // 自家 scope 下不存在的包名：不是外部依赖，是写错的自家包（本仓 scope 由 workspace 包名推出）
    const scope = scopeOf(name);
    const ownScope =
      scope !== null &&
      [...context.workspacePackages.keys()].some((known) => scopeOf(known) === scope);
    if (ownScope) {
      return { specifier, kind: 'workspace', outcome: 'unresolved', target: null };
    }
    return { specifier, kind: 'external', outcome: 'external', target: null };
  }

  const rest = cleaned.slice(name.length).replace(/^\//, '');
  const candidates = rest
    ? (pkg.subpaths?.get(`./${rest}`) ?? [`${pkg.dir}/src/${rest}`])
    : pkg.entries;
  const hit = probe(candidates, context.files);
  return {
    specifier,
    kind: 'workspace',
    outcome: hit?.outcome ?? 'unresolved',
    target: hit?.target ?? null,
  };
}
