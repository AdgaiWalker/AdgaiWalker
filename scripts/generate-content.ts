/**
 * generate-content — 扫描 content/log → apps/web/src/generated/content.json
 * 依赖：gray-matter、paths
 * 触发：pnpm content:gen / build-web / dev:web
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { inferContentHall } from '../apps/web/src/shared/content-halls';
import { dualEntry } from '../apps/web/src/shared/dual-entry';
import { createHash } from 'node:crypto';
import { buildKnowledgeGraph } from '../packages/shared/src/graph';
import { normalizeLegacyBody, publicManifest } from '../packages/shared/src/public-snapshot';
import { loadContentCreatedDates } from './lib/git-created';
import type {
  AiUsePolicy,
  ContentResource,
  GeneratedContentItem,
} from './lib/content-model';
import {
  contentJsonPath,
  contentLogDir,
  graphJsonPath,
  repoRoot,
  webGeneratedDir,
} from './lib/paths';

type Visibility = 'public' | 'draft' | 'private';

export type ContentItem = GeneratedContentItem;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
}

function asSeriesOrder(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value.trim() : '';
}

function asAiUsePolicy(value: unknown): AiUsePolicy {
  const policy =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  return {
    level: typeof policy.level === 'string' ? policy.level.trim() : '',
    readable: policy.readable === true,
    citable: policy.citable === true,
    actionable: policy.actionable === true,
    reason: typeof policy.reason === 'string' ? policy.reason.trim() : '',
  };
}

function asResources(value: unknown): ContentResource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const resource = entry as Record<string, unknown>;
    if (typeof resource.name !== 'string' || typeof resource.url !== 'string') {
      return [];
    }
    return [{
      name: resource.name.trim(),
      url: resource.url.trim(),
      type: typeof resource.type === 'string' ? resource.type.trim() : '',
      description:
        typeof resource.description === 'string'
          ? resource.description.trim()
          : '',
    }];
  });
}

function resolveVisibility(data: Record<string, unknown>): Visibility {
  if (
    data.visibility === 'public' ||
    data.visibility === 'draft' ||
    data.visibility === 'private'
  ) {
    return data.visibility;
  }
  if (data.published === false) return 'draft';
  return 'public';
}

/** 旧 Astro/MDX 展示组件降级：实现只有一份，在 packages/shared（构建与 API 版本证明共用）。 */
function firstMarkdownImage(body: string): string {
  const match = body.match(/!\[[^\]]*\]\(([^\s)]+)(?:\s+['"][^)]*['"])?\)/);
  return match?.[1]?.trim() ?? '';
}

const docs: ContentItem[] = [];
if (fs.existsSync(contentLogDir)) {
  for (const file of fs.readdirSync(contentLogDir)) {
    if (!/\.(md|mdx)$/i.test(file)) continue;
    const raw = fs.readFileSync(path.join(contentLogDir, file), 'utf8');
    const { data, content } = matter(raw);
    const slug = file.replace(/\.(md|mdx)$/i, '');
    const visibility = resolveVisibility(data as Record<string, unknown>);
    if (visibility !== 'public') continue;
    const body = normalizeLegacyBody(content);
    docs.push({
      slug,
      title: typeof data.title === 'string' ? data.title : slug,
      date: asDateString(data.date),
      updated: asDateString(data.updated) || asDateString(data.date),
      author:
        typeof data.author === 'string' && data.author.trim()
          ? data.author.trim()
          : 'Dora',
      type: String(data.type || 'knowledge'),
      form: typeof data.form === 'string' ? data.form.trim() : '',
      domain: typeof data.domain === 'string' ? data.domain.trim() : '',
      intent: typeof data.intent === 'string' ? data.intent.trim() : '',
      valueMode:
        typeof data.valueMode === 'string' ? data.valueMode.trim() : '',
      status: data.status ? String(data.status) : '',
      summary: String(data.summary || data.description || ''),
      body,
      tags: Array.isArray(data.tags)
        ? data.tags.filter((t): t is string => typeof t === 'string')
        : [],
      level: data.level ? String(data.level) : '',
      emoji: data.emoji ? String(data.emoji) : '',
      image:
        typeof data.image === 'string' && data.image.trim()
          ? data.image.trim()
          : firstMarkdownImage(body),
      url: typeof data.url === 'string' ? data.url.trim() : '',
      visibility,
      published: true,
      hall: inferContentHall({
        hall: typeof data.hall === 'string' ? data.hall : undefined,
        type: String(data.type || 'knowledge'),
        form: typeof data.form === 'string' ? data.form : undefined,
        series: data.series ? String(data.series).trim() : undefined,
      }),
      series: data.series ? String(data.series).trim() : '',
      seriesOrder: asSeriesOrder(data.seriesOrder),
      related: asStringArray(data.related),
      version: asSeriesOrder(data.version),
      previousVersion:
        typeof data.previousVersion === 'string'
          ? data.previousVersion.trim()
          : '',
      aiUsePolicy: asAiUsePolicy(data.aiUsePolicy),
      resources: asResources(data.resources),
    });
  }
}

docs.sort((a, b) => {
  const byDate = b.date.localeCompare(a.date);
  if (byDate !== 0) return byDate;
  if (
    a.series &&
    a.series === b.series &&
    a.seriesOrder != null &&
    b.seriesOrder != null
  ) {
    return a.seriesOrder - b.seriesOrder;
  }
  return a.title.localeCompare(b.title, 'zh-CN');
});
fs.mkdirSync(webGeneratedDir, { recursive: true });
const nextPayload = JSON.stringify({ generatedAt: new Date().toISOString(), items: docs }, null, 2);
// 内容未变时不重写：generatedAt 时间戳不应在每次构建制造无意义 diff
let unchanged = false;
try {
  const existing = JSON.parse(fs.readFileSync(contentJsonPath, 'utf8')) as { items?: unknown };
  unchanged = JSON.stringify(existing.items) === JSON.stringify(docs);
} catch {
  /* 无旧文件或旧文件损坏 → 正常写入 */
}
if (unchanged) {
  console.log(`content unchanged (${docs.length} items); keep existing content.json`);
} else {
  fs.writeFileSync(contentJsonPath, nextPayload);
  console.log(`wrote ${docs.length} items → ${contentJsonPath}`);
}
function getGitCommit(): string | null {
  try {
    const r = spawnSync('git', ['log', '-1', '--format=%H'], {
      cwd: repoRoot,
      encoding: 'utf8',
      windowsHide: true,
    });
    return r.stdout?.trim() || null;
  } catch {
    return null;
  }
}

const gitCommit = getGitCommit();
const rawManifest = publicManifest(docs, (text) => createHash('sha256').update(text).digest('hex'));
const manifest = {
  ...rawManifest,
  gitCommit,
};
fs.writeFileSync(path.join(webGeneratedDir, 'public-manifest.json'), JSON.stringify(manifest));
// Serve the exact manifest from the deployed web build so snapshot import can verify provenance.
fs.writeFileSync(path.join(repoRoot, 'public/public-manifest.json'), JSON.stringify(manifest));
console.log(`wrote public manifest ${manifest.items.length} items (commit: ${gitCommit ?? 'unknown'})`);

// ---- 知识图谱产物（PRD-KNOWLEDGE-GRAPH §5）----
// 只由公开条目构建；created 取 Git 首次出现时间（Animate 依据）；附件为 content/log 下的非 md 文件。
const createdDates = loadContentCreatedDates();
const attachmentFiles = fs.existsSync(contentLogDir)
  ? fs
      .readdirSync(contentLogDir)
      .filter((file) => !/\.(md|mdx)$/i.test(file) && !file.startsWith('.'))
      .map((file) => path.relative(repoRoot, path.join(contentLogDir, file)))
  : [];

const graph = buildKnowledgeGraph({
  items: docs.map((doc) => ({
    ...doc,
    created: createdDates.get(`${doc.slug}.md`) ?? createdDates.get(`${doc.slug}.mdx`) ?? '',
  })),
  attachments: attachmentFiles,
  browsePath: dualEntry.browse.path,
  now: new Date().toISOString(),
});

let graphUnchanged = false;
try {
  const existing = JSON.parse(fs.readFileSync(graphJsonPath, 'utf8')) as {
    nodes?: unknown;
    edges?: unknown;
  };
  graphUnchanged =
    JSON.stringify(existing.nodes) === JSON.stringify(graph.nodes) &&
    JSON.stringify(existing.edges) === JSON.stringify(graph.edges);
} catch {
  /* 无旧文件或旧文件损坏 → 正常写入 */
}

if (graphUnchanged) {
  console.log(
    `graph unchanged (${graph.nodes.length} nodes / ${graph.edges.length} edges); keep existing graph.json`,
  );
} else {
  fs.writeFileSync(graphJsonPath, JSON.stringify(graph, null, 2));
  const counts = graph.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.kind] = (acc[node.kind] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `wrote graph → ${graphJsonPath} (${Object.entries(counts)
      .map(([kind, total]) => `${kind} ${total}`)
      .join(' / ')}; ${graph.edges.length} edges)`,
  );
}
