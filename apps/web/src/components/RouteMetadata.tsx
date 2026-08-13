/**
 * SPA 导航 metadata 同步。
 *
 * 构建期静态 HTML 负责抓取与首次响应；本组件只在客户端切换路由后
 * 同步 head，避免沿用上一页的标题、canonical 或结构化数据。
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getBrowseItems, getPostBySlug, type ContentItem } from '../content';
import { WEB_ROUTES } from '../shared/routes';

const SITE_ORIGIN = 'https://www.iwalk.pro';
const SITE_NAME = 'Walker';
const SITE_TITLE = 'Walker · 用 AI 走自己的路';
const SITE_DESCRIPTION =
  'duola 的个人知识与行动样板站：把真实卡点变成可检验的下一步，把走过的路收成教程、资源、项目与札记。';
const DEFAULT_IMAGE = `${SITE_ORIGIN}/images/hero-bg.png`;
const PERSON_ID = `${SITE_ORIGIN}/me#person`;

type RouteMetadataValue = {
  title: string;
  description: string;
  canonicalPath: string;
  type?: 'website' | 'article' | 'profile';
  indexable?: boolean;
};

const STATIC_METADATA: Record<string, RouteMetadataValue> = {
  [WEB_ROUTES.home]: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    canonicalPath: '/',
  },
  [WEB_ROUTES.browse]: {
    title: '证据 · Walker',
    description:
      'duola 公开的教程、点子、项目与札记：来自真实实践，可按主题阅读与引用。',
    canonicalPath: WEB_ROUTES.browse,
  },
  [WEB_ROUTES.tutorials]: {
    title: '教程 · Walker',
    description: '来自真实使用的步骤与经验：搞到条件、跟上工具，照着可以开始做。',
    canonicalPath: WEB_ROUTES.tutorials,
  },
  [WEB_ROUTES.ideas]: {
    title: '点子 · Walker',
    description: '实验中的苗：尚未对准需求，或还没有完整做成的想法与交互原型。',
    canonicalPath: WEB_ROUTES.ideas,
  },
  [WEB_ROUTES.projects]: {
    title: '项目 · Walker',
    description: '已经做出来、可查看、可链接、可检验的公开交付。',
    canonicalPath: WEB_ROUTES.projects,
  },
  [WEB_ROUTES.lab]: {
    title: '札记 · Walker',
    description: '实验中沉淀的经验与思考；观点保留形成时的边界，并通过实践继续更新。',
    canonicalPath: WEB_ROUTES.lab,
  },
  [WEB_ROUTES.toolsResources]: {
    title: '资源 · Walker',
    description:
      'duola 实际在用或了解的群、工具与引路人；外部服务与本站无利益关系，使用前请自行核验。',
    canonicalPath: WEB_ROUTES.toolsResources,
  },
  [WEB_ROUTES.about]: {
    title: '关于本站 · Walker',
    description:
      'Walker 是 duola 的个人知识与行动样板站：人的认识沉淀为知识库，服务判断与行动，再由实践回灌知识。',
    canonicalPath: WEB_ROUTES.about,
  },
  [WEB_ROUTES.me]: {
    title: 'duola · 关于我',
    description:
      'duola，艺术生，在用 AI 解决真实问题：把真实卡点变成可检验的下一步，把走过的路收成公开证据。',
    canonicalPath: WEB_ROUTES.me,
    type: 'profile',
  },
  [WEB_ROUTES.ask]: {
    title: '卡 · Walker',
    description: '说清一个真实卡点，拿到可以立即开始的下一步。',
    canonicalPath: WEB_ROUTES.ask,
    indexable: false,
  },
  [WEB_ROUTES.condition]: {
    title: '条件 · Walker',
    description: '先把工具、渠道和现实条件准备好，再开始行动。',
    canonicalPath: WEB_ROUTES.condition,
    indexable: false,
  },
  [WEB_ROUTES.kit]: {
    title: '器具 · Walker',
    description: '实际使用过的工具、设备和组合方式。',
    canonicalPath: WEB_ROUTES.kit,
    indexable: false,
  },
  [WEB_ROUTES.showcase]: {
    title: '样板 · Walker',
    description: '已经做出来、可以查看和检验的样板。',
    canonicalPath: WEB_ROUTES.showcase,
    indexable: false,
  },
  [WEB_ROUTES.exchange]: {
    title: '交换 · Walker',
    description: '围绕真实问题、成果与经验建立联系。',
    canonicalPath: WEB_ROUTES.exchange,
    indexable: false,
  },
  [WEB_ROUTES.ferry]: {
    title: 'Ferry · Walker',
    description: '从差距到行动、做减法并持续迭代的思考线。',
    canonicalPath: WEB_ROUTES.ferry,
  },
  [WEB_ROUTES.advanceTrilogy]: {
    title: '前进三部曲 · Walker',
    description: '为什么走、路上留下什么，以及想走向哪里。',
    canonicalPath: WEB_ROUTES.advanceTrilogy,
  },
  [WEB_ROUTES.learn]: {
    title: '学习 · Walker',
    description: '沿着真实任务进入教程和学习路径。',
    canonicalPath: WEB_ROUTES.learn,
  },
  [WEB_ROUTES.gear]: {
    title: '装备 · Walker',
    description: 'duola 当前使用的设备与工作组合。',
    canonicalPath: WEB_ROUTES.gear,
  },
  [WEB_ROUTES.support]: {
    title: '支持 · Walker',
    description: '支持 Walker 继续记录、实践与公开分享。',
    canonicalPath: WEB_ROUTES.support,
    indexable: false,
  },
  [WEB_ROUTES.login]: {
    title: '登录 · Walker',
    description: 'Walker 账户入口。',
    canonicalPath: WEB_ROUTES.login,
    indexable: false,
  },
};

function absoluteUrl(pathname: string): string {
  return `${SITE_ORIGIN}${pathname === '/' ? '/' : pathname.replace(/\/$/, '')}`;
}

function upsertMeta(
  attribute: 'name' | 'property',
  key: string,
  value: string,
): void {
  let element = document.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`,
  );
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
  document
    .querySelectorAll('link[rel="alternate"][type="text/markdown"]')
    .forEach((element) => element.remove());
  if (!item?.aiUsePolicy?.readable) return;
  const element = document.createElement('link');
  element.rel = 'alternate';
  element.type = 'text/markdown';
  element.href = absoluteUrl(
    `${WEB_ROUTES.browse}/${encodeURIComponent(item.slug)}/index.md`,
  );
  document.head.append(element);
}

function syncArticleMeta(item?: ContentItem): void {
  document
    .querySelectorAll('meta[property^="article:"]')
    .forEach((element) => element.remove());
  if (!item) return;

  const values = [
    ['article:published_time', item.date],
    ['article:modified_time', item.updated || item.date],
    ['article:author', `${SITE_ORIGIN}/me`],
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
  const canonical = absoluteUrl(metadata.canonicalPath);
  const graph: Array<Record<string, unknown>> = [
    {
      '@type': 'WebSite',
      '@id': `${SITE_ORIGIN}/#website`,
      url: `${SITE_ORIGIN}/`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: 'zh-CN',
    },
    {
      '@type': 'WebPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: metadata.title,
      description: metadata.description,
      isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
      inLanguage: 'zh-CN',
    },
  ];

  if (item) {
    const image = item.image
      ? item.image.startsWith('http')
        ? item.image
        : absoluteUrl(item.image)
      : undefined;
    graph.push(
      {
        '@type': 'BlogPosting',
        '@id': `${canonical}#article`,
        url: canonical,
        mainEntityOfPage: { '@id': `${canonical}#webpage` },
        headline: item.title,
        description: item.summary,
        datePublished: item.date,
        dateModified: item.updated || item.date,
        author: { '@id': PERSON_ID, name: item.author || 'duola' },
        publisher: { '@id': PERSON_ID },
        inLanguage: 'zh-CN',
        articleSection: item.series || item.domain || item.type,
        keywords: item.tags,
        isAccessibleForFree: true,
        ...(image ? { image } : {}),
      },
      {
        '@type': 'Person',
        '@id': PERSON_ID,
        name: item.author || 'duola',
        url: `${SITE_ORIGIN}/me`,
        image: `${SITE_ORIGIN}/images/duola.jpg`,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonical}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: SITE_NAME,
            item: `${SITE_ORIGIN}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: '证据',
            item: absoluteUrl(WEB_ROUTES.browse),
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: item.title,
            item: canonical,
          },
        ],
      },
    );
  } else if (metadata.canonicalPath === WEB_ROUTES.browse) {
    graph.push({
      '@type': 'CollectionPage',
      '@id': `${canonical}#collection`,
      url: canonical,
      name: metadata.title,
      description: metadata.description,
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: getBrowseItems().map((entry, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: absoluteUrl(
            `${WEB_ROUTES.browse}/${encodeURIComponent(entry.slug)}`,
          ),
          name: entry.title,
        })),
      },
    });
  } else if (metadata.canonicalPath === WEB_ROUTES.me) {
    graph.push(
      {
        '@type': 'ProfilePage',
        '@id': `${canonical}#profile`,
        url: canonical,
        name: metadata.title,
        mainEntity: { '@id': PERSON_ID },
      },
      {
        '@type': 'Person',
        '@id': PERSON_ID,
        name: 'duola',
        url: canonical,
        image: `${SITE_ORIGIN}/images/duola.jpg`,
      },
    );
  } else if (metadata.canonicalPath === WEB_ROUTES.about) {
    graph.push({
      '@type': 'AboutPage',
      '@id': `${canonical}#about`,
      url: canonical,
      name: metadata.title,
      description: metadata.description,
      about: { '@id': `${SITE_ORIGIN}/#website` },
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

function syncSchema(metadata: RouteMetadataValue, item?: ContentItem): void {
  let element = document.querySelector<HTMLScriptElement>('#site-json-ld');
  if (!element) {
    element = document.querySelector<HTMLScriptElement>(
      'script[type="application/ld+json"]',
    );
  }
  if (!element) {
    element = document.createElement('script');
    element.type = 'application/ld+json';
    document.head.append(element);
  }
  element.id = 'site-json-ld';
  element.textContent = JSON.stringify(schemaFor(metadata, item));
}

function syncMetadata(metadata: RouteMetadataValue, item?: ContentItem): void {
  const canonical = absoluteUrl(metadata.canonicalPath);
  const image = item?.image
    ? item.image.startsWith('http')
      ? item.image
      : absoluteUrl(item.image)
    : metadata.type === 'profile'
      ? `${SITE_ORIGIN}/images/duola.jpg`
      : DEFAULT_IMAGE;

  document.title = metadata.title;
  upsertCanonical(canonical);
  upsertMeta('name', 'description', metadata.description);
  upsertMeta('name', 'author', 'duola');
  upsertMeta(
    'name',
    'robots',
    metadata.indexable === false ? 'noindex, follow' : 'index, follow',
  );
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
    const normalizedPath =
      pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
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
