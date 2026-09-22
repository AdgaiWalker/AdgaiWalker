/**
 * 文件系统代码体检 — 读 gen 期落下的产物与门禁基线。
 *
 * 路径解析沿用 `fs-site-content-index` / `fs-knowledge-graph` 的既成模式：
 * 环境变量优先，否则按 cwd 三候选探测（盒子 / 仓库根 / 应用目录三种启动位置）。
 *
 * 三条硬规则（对应一次评审修复）：
 * 1. **只经 shared 契约层取数**：形状/版本不对 → `code-health-malformed`，绝不放行
 *    一个「看起来像」的产物让下游在 `.length` 处崩（过期产物是常态，不是异常路径）。
 * 2. **失败按「谁的错」分类**：没生成 / 配错路径 / 产物坏，三种码，不抛裸 ENOENT。
 * 3. **缓存签名覆盖全部输入**：图、体检、基线三个文件任一变更都要失效 ——
 *    只看一个文件的 mtime，跑过 `--update-baseline` 后 admin 会一直显示旧对账。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  parseArchitectureBaseline,
  parseCodeGraphArtifact,
  parseCodeGraphHealthArtifact,
} from '@walker/shared';
import {
  CodeHealthError,
  type CodeHealthBundle,
  type CodeHealthPort,
} from '../ports/code-health.port';

/** 三种可能的启动位置（相对 cwd） */
function candidates(relative: string): string[] {
  return [
    path.resolve(process.cwd(), `../${relative}`),
    path.resolve(process.cwd(), relative),
    path.resolve(process.cwd(), `../../${relative}`),
  ];
}

async function firstExisting(paths: string[]): Promise<string | null> {
  for (const candidate of paths) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* next */
    }
  }
  return null;
}

/**
 * 环境变量优先，其次三候选探测。
 * 显式配了路径却不存在，属于**配置错误**而不是「探测失败」：按分类抛出，
 * 别让运维去猜一个裸 ENOENT。
 */
async function pick(envName: string, relative: string): Promise<string | null> {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    try {
      await fs.access(resolved);
    } catch {
      throw new CodeHealthError(
        'code-health-misconfigured',
        `${envName}=${fromEnv} 指向的文件不存在`,
      );
    }
    return resolved;
  }
  return firstExisting(candidates(relative));
}

/** 读 + JSON 解析。解析失败也按 malformed 分类，与「形状不对」同码 */
async function readRaw(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    throw new CodeHealthError(
      'code-health-malformed',
      `${file} 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export class FsCodeHealth implements CodeHealthPort {
  private cachedSignature = '';
  private cache: CodeHealthBundle | null = null;

  async load(): Promise<CodeHealthBundle> {
    const graphFile = await pick('WALKER_CODE_GRAPH_JSON', 'apps/web/src/generated/codegraph.json');
    const healthFile = await pick(
      'WALKER_CODE_GRAPH_HEALTH_JSON',
      'apps/web/src/generated/codegraph-health.json',
    );
    if (!graphFile || !healthFile) {
      throw new CodeHealthError(
        'code-health-unavailable',
        `找不到产物（graph=${graphFile ?? '缺'}，health=${healthFile ?? '缺'}）；先跑 pnpm code:gen`,
      );
    }

    // 基线可以缺席（还没跑过 --update-baseline）：缺席时 admin 只展示现状，不假装对账过
    const baselineFile = await firstExisting(candidates('scripts/architecture-baseline.json'));

    const [graphStat, healthStat, baselineStat] = await Promise.all([
      fs.stat(graphFile),
      fs.stat(healthFile),
      baselineFile ? fs.stat(baselineFile).catch(() => null) : null,
    ]);
    const signature = [
      graphStat.mtimeMs,
      healthStat.mtimeMs,
      baselineStat?.mtimeMs ?? 0,
    ].join(':');
    if (this.cache && signature === this.cachedSignature) return this.cache;

    const graph = parseCodeGraphArtifact(await readRaw(graphFile));
    if (!graph.ok) throw new CodeHealthError('code-health-malformed', graph.reason);
    const health = parseCodeGraphHealthArtifact(await readRaw(healthFile));
    if (!health.ok) throw new CodeHealthError('code-health-malformed', health.reason);

    // 基线坏了**不降级**为 null：那会让 admin 显示「还没有基线」这个谎话。
    // 按分类抛出，让站主看到真实原因。
    let baseline: CodeHealthBundle['baseline'] = null;
    if (baselineFile) {
      const parsed = parseArchitectureBaseline(await readRaw(baselineFile));
      if (!parsed.ok) throw new CodeHealthError('code-health-malformed', parsed.reason);
      baseline = parsed.value;
    }

    this.cache = { graph: graph.value, health: health.value, baseline };
    this.cachedSignature = signature;
    return this.cache;
  }
}
