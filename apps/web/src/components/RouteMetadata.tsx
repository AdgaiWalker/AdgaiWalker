/**
 * SPA 导航 metadata 同步。
 *
 * 构建期静态 HTML 负责抓取与首次响应；本组件只在客户端切换路由后
 * 同步 head，并与 shared/site-identity 共用同源的 URL 与 Schema.org 构图逻辑。
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  SITE_AUTHOR,
  SITE_DEFAULT_IMAGE,
  SITE_NAME,
  SITE_ROUTE_METADATA,
  buildAboutPageJsonLdNode,
  buildBlogPostingJsonLdGraph,
  buildCollectionJsonLdNode,
  buildCommonJsonLdNodes,
  buildProfilePageJsonLdNode,
  resolveSiteAssetUrl,
  siteAbsoluteUrl,
  wrapJsonLdGraph,
} from '@walker/shared';
import { getBrowseItems, getPostBySlug, type ContentItem } from '../content';
import { WEB_ROUTES } from '../shared/routes';

type RouteMetadataValue = {
  title: string;
  description: string;
  canonicalPath: string;
  type?: 'website' | 'article' | 'profile';
  indexable?: boolean;
};

const STATIC_METADATA: Record<string, RouteMetadataValue> = Object.fromEntries(
  Object.entries(SITE_ROUTE_METADATA).map(([canonicalPath, meta]) => [
    canonicalPath,
    {
      title: meta.title,
      description: meta.description,
      canonicalPath,
      ...(meta.type ? { type: meta.type } : {}),
      ...(meta.indexable === false ? { indexable: false } : {}),
    },
  ]),
);

function upsertMeta(attribute: 'name' | 'property', key: string, value: string): void {
  let element = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = value;
}

function upsertCanonical(href: string): void {
  let element = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.rel = 'canonical';
    document.head.append(element);
  }
  element.href = href;
}

function syncMarkdownAlternate(item?: ContentItem): void {
  document.querySelectorAll('link[rel="alternate"][type="text/markdown"]').forEach((element) => element.remove());
  if (!item?.aiUsePolicy?.readable) return;
  const element = document.createElement('link');
  element.rel = 'alternate';
  element.type = 'text/markdown';
  element.href = siteAbsoluteUrl(`${WEB_ROUTES.browse}/${encodeURIComponent(item.slug)}/index.md`);
  document.head.append(element);
}

function syncArticleMeta(item?: ContentItem): void {
  document.querySelectorAll('meta[property^="article:"]').forEach((element) => element.remove());
  if (!item) return;

  const values = [
    ['article:published_time', item.date],
    ['article:modified_time', item.updated || item.date],
    ['article:author', SITE_AUTHOR.url],
    ...item.tags.map((tag) => ['article:tag', tag]),
  ];
  for (const [property, content] of values) {
    const element = document.createElement('meta');
    element.setAttribute('property', property);
    element.content = content;
    document.head.append(element);
  }
}

function schemaFor(metadata: RouteMetadataValue, item?: ContentItem): unknown {
  if (item) {
    return buildBlogPostingJsonLdGraph({
      pathname: metadata.canonicalPath,
      browsePath: WEB_ROUTES.browse,
      title: item.title,
      summary: item.summary,
      published: item.date,
      modified: item.updated || item.date,
      authorName: item.author,
      image: item.image,
      section: item.series || item.domain || item.type,
      tags: item.tags,
    });
  }
  const nodes = buildCommonJsonLdNodes(metadata.canonicalPath, metadata.title, metadata.description);
  if (metadata.canonicalPath === WEB_ROUTES.browse) {
    nodes.push(buildCollectionJsonLdNode({
      pathname: metadata.canonicalPath,
      title: metadata.title,
      description: metadata.description,
      items: getBrowseItems().map((entry) => ({
        url: siteAbsoluteUrl(`${WEB_ROUTES.browse}/${encodeURIComponent(entry.slug)}`),
        name: entry.title,
      })),
    }));
  } else if (metadata.canonicalPath === WEB_ROUTES.me) {
    nodes.push(buildProfilePageJsonLdNode(metadata.canonicalPath, metadata.title));
  } else if (metadata.canonicalPath === WEB_ROUTES.about) {
    nodes.push(buildAboutPageJsonLdNode(metadata.canonicalPath, metadata.title, metadata.description));
  }
  return wrapJsonLdGraph(nodes);
}

function syncSchema(metadata: RouteMetadataValue, item?: ContentItem): void {
  let element = document.querySelector<HTMLScriptElement>('#site-json-ld')
    ?? document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
  if (!element) {
    element = document.createElement('script');
    element.type = 'application/ld+json';
    document.head.append(element);
  }
  element.id = 'site-json-ld';
  element.textContent = JSON.stringify(schemaFor(metadata, item));
}

function syncMetadata(metadata: RouteMetadataValue, item?: ContentItem): void {
  const canonical = siteAbsoluteUrl(metadata.canonicalPath);
  const image = resolveSiteAssetUrl(item?.image)
    || (metadata.type === 'profile' ? SITE_AUTHOR.image : SITE_DEFAULT_IMAGE);

  document.title = metadata.title;
  upsertCanonical(canonical);
  upsertMeta('name', 'description', metadata.description);
  upsertMeta('name', 'author', SITE_AUTHOR.name);
  upsertMeta('name', 'robots', metadata.indexable === false ? 'noindex, follow' : 'index, follow');
  upsertMeta('property', 'og:type', metadata.type || 'website');
  upsertMeta('property', 'og:site_name', SITE_NAME);
  upsertMeta('property', 'og:locale', 'zh_CN');
  upsertMeta('property', 'og:title', metadata.title);
  upsertMeta('property', 'og:description', metadata.description);
  upsertMeta('property', 'og:url', canonical);
  upsertMeta('property', 'og:image', image);
  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', metadata.title);
  upsertMeta('name', 'twitter:description', metadata.description);
  upsertMeta('name', 'twitter:image', image);
  syncMarkdownAlternate(item);
  syncArticleMeta(item);
  syncSchema(metadata, item);
}

function itemFromPath(pathname: string): ContentItem | undefined {
  const prefix = `${WEB_ROUTES.browse}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const encodedSlug = pathname.slice(prefix.length).split('/')[0];
  try {
    return getPostBySlug(decodeURIComponent(encodedSlug));
  } catch {
    return undefined;
  }
}

export function RouteMetadata() {
  const { pathname } = useLocation();

  useEffect(() => {
    const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
    const item = itemFromPath(normalizedPath);
    if (item) {
      syncMetadata(
        {
          title: `${item.title} · Walker`,
          description: item.summary,
          canonicalPath: `${WEB_ROUTES.browse}/${encodeURIComponent(item.slug)}`,
          type: 'article',
        },
        item,
      );
      return;
    }

    syncMetadata(
      STATIC_METADATA[normalizedPath] ?? {
        title: '没有这页 · Walker',
        description: '链接可能已改名，或来自旧站路径。',
        canonicalPath: normalizedPath,
        indexable: false,
      },
    );
  }, [pathname]);

  return null;
}
