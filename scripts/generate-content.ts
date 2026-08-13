/**
 * generate-content — 扫描 content/log → apps/web/src/generated/content.json
 * 依赖：gray-matter、paths
 * 触发：pnpm content:gen / build-web / dev:web
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { inferContentHall } from '../apps/web/src/shared/content-halls';
import type {
  AiUsePolicy,
  ContentResource,
  GeneratedContentItem,
} from './lib/content-model';
import { contentLogDir, contentJsonPath, webGeneratedDir } from './lib/paths';

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

function tagAttribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}=(['"])(.*?)\\1`));
  return match?.[2]?.trim() ?? '';
}

/** 把旧 Astro/MDX 展示组件降级成标准 Markdown，保证 Web 与 AI 都能读。 */
function normalizeLegacyMdx(body: string): string {
  return body
    .split('\n')
    .flatMap((line) => {
      const t = line.trim();
      if (
        t.startsWith('import ') &&
        (/\.astro['"]\s*;?\s*$/.test(t) ||
          (/from\s+['"]@\/components\//.test(t) && t.includes('astro')))
      ) {
        return [];
      }
      if (t.startsWith('<BlockCallout ')) {
        return [`> **${tagAttribute(t, 'title') || '提示'}**`];
      }
      if (t === '</BlockCallout>') return [];
      if (t.startsWith('<BlockVideo ')) {
        const bvid = tagAttribute(t, 'bvid');
        return bvid
          ? [`[哔哩哔哩视频：${bvid}](https://www.bilibili.com/video/${bvid})`]
          : [];
      }
      if (t.startsWith('<BlockResource ')) {
        const href = tagAttribute(t, 'href');
        const title = tagAttribute(t, 'title') || '延伸资源';
        const description = tagAttribute(t, 'description');
        return href
          ? [`[${title}](${href})${description ? ` — ${description}` : ''}`]
          : [];
      }
      if (t.startsWith('<BlockStep ')) {
        const n = tagAttribute(t, 'n');
        const title = tagAttribute(t, 'title') || '步骤';
        return [`### ${n ? `${n}. ` : ''}${title}`];
      }
      if (t === '</BlockStep>') return [];
      if (t.startsWith('<BlockPrompt ')) {
        const title = tagAttribute(t, 'title') || '提示词';
        return [`### ${title}`, '', '```text'];
      }
      if (t === '</BlockPrompt>') return ['```'];
      return [line];
    })
    .join('\n')
    .replace(/^\s*\n+/, '')
    .trim();
}

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
    const body = normalizeLegacyMdx(content);
    docs.push({
      slug,
      title: typeof data.title === 'string' ? data.title : slug,
      date: asDateString(data.date),
      updated: asDateString(data.updated) || asDateString(data.date),
      author:
        typeof data.author === 'string' && data.author.trim()
          ? data.author.trim()
          : 'duola',
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

docs.sort((a, b) => (a.date < b.date ? 1 : -1));
fs.mkdirSync(webGeneratedDir, { recursive: true });
fs.writeFileSync(
  contentJsonPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), items: docs }, null, 2),
);
console.log(`wrote ${docs.length} items → ${contentJsonPath}`);
