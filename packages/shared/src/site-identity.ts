/**
 * 公开站身份、URL 与 Schema.org JSON-LD 单一真相源（browser / node / scripts 通用）。
 * 统一规范站点域名、标题、作者、静态资产解析与结构化数据构图，避免前后端/预渲染各自漂移。
 */
export const SITE_ORIGIN = 'https://www.iwalk.pro';
export const SITE_NAME = 'Walker';
export const SITE_TITLE = 'Walker · 用好 AI 做好事';
export const SITE_DESCRIPTION =
  'Dora 的个人知识与行动样板站：把真实卡点变成可检验的下一步，把走过的路收成教程、资源、探索与札记。';
export const SITE_LANGUAGE = 'zh-CN';

export const SITE_AUTHOR = {
  name: 'Dora',
  url: `${SITE_ORIGIN}/me`,
  image: `${SITE_ORIGIN}/images/dora.jpg`,
} as const;

export const SITE_DEFAULT_IMAGE = `${SITE_ORIGIN}/images/hero-bg.png`;
export const SITE_WEBSITE_ID = `${SITE_ORIGIN}/#website`;
export const SITE_PERSON_ID = `${SITE_AUTHOR.url}#person`;

export interface SiteRouteMetadata {
  title: string;
  description: string;
  heading?: string;
  type?: 'website' | 'article' | 'profile';
  indexable?: boolean;
}

/** 公开静态页与独立 SPA 壳层路由唯一元数据字典（SSR 预渲染与浏览器客户端水合共用）。 */
export const SITE_ROUTE_METADATA: Readonly<Record<string, SiteRouteMetadata>> = {
  '/': {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  '/posts': {
    title: '文章 · Walker',
    description: 'Dora 公开的思考与实践记录：来自真实经历，沿时间持续生长，可按主题阅读与引用。',
  },
  '/tutorials': {
    title: '教程 · Walker',
    description: '来自真实使用的步骤与经验：搞到条件、跟上工具，照着可以开始做。',
  },
  '/explore': {
    title: '探索 · Walker',
    description: '从一个念头开始，在实践里逐渐长成：点子可以持续推进，项目是被明确立项的持续交付。',
  },
  '/lab': {
    title: '札记 · Walker',
    description: '实验中沉淀的经验与思考；观点保留形成时的边界，并通过实践继续更新。',
  },
  '/tools/resources': {
    title: '资源 · Walker',
    description: 'Dora 实际在用或了解的群、工具与引路人；外部服务与本站无利益关系，使用前请自行核验。',
  },
  '/graph': {
    title: '结构 · Walker',
    description: 'Walker 公开内容的互引结构：谁引用了谁、哪些文章还没有互相引用。只由正文内链构成，不含模型推断。',
  },
  '/about': {
    title: '关于本站 · Walker',
    description: 'Walker 是 Dora 的个人知识与行动样板站：人的认识沉淀为知识库，服务判断与行动，再由实践回灌知识。',
  },
  '/me': {
    title: `${SITE_AUTHOR.name} · 关于我`,
    description: 'Dora，艺术生，在用 AI 解决真实问题：把真实卡点变成可检验的下一步，把走过的路收成公开证据。',
    type: 'profile',
  },
  '/tools': {
    title: '提问 · Walker',
    description: '说清一个真实卡点，拿到可以立即开始的下一步。',
    heading: '你卡在哪？',
    indexable: false,
  },
  '/tools/result': {
    title: '下一步 · Walker',
    description: '这次卡点拿到的下一步与依据；结果只在生成它的浏览器里可还原。',
    heading: '你的下一步',
    indexable: false,
  },
  '/ask': {
    title: '小影 · Walker',
    description: '了解站主、找内容、问路径；回答只依据站内已公开且可引用的内容。',
    heading: '小影',
    indexable: false,
  },
  '/condition': {
    title: '条件 · Walker',
    description: '先把工具、渠道和现实条件准备好，再开始行动。',
    indexable: false,
  },
  '/kit': {
    title: '器具 · Walker',
    description: '实际使用过的工具、设备和组合方式。',
    indexable: false,
  },
  '/showcase': {
    title: '样板 · Walker',
    description: '已经做出来、可以查看和检验的样板。',
    indexable: false,
  },
  '/exchange': {
    title: '交换 · Walker',
    description: '围绕真实问题、成果与经验建立联系。',
    heading: '交换',
    indexable: false,
  },
  '/projects/ferry': {
    title: 'Ferry · Walker',
    description: '从差距到行动、做减法并持续迭代的思考线。',
  },
  '/advance': {
    title: '前进三部曲 · Walker',
    description: '为什么走、路上留下什么，以及想走向哪里。',
  },
  '/learn': {
    title: '学习 · Walker',
    description: '沿着真实任务进入教程和学习路径。',
  },
  '/gear': {
    title: '装备 · Walker',
    description: 'Dora 当前使用的设备与工作组合。',
  },
  '/support': {
    title: '支持 · Walker',
    description: '支持 Walker 继续记录、实践与公开分享。',
    heading: '支持 / 赞赏',
    indexable: false,
  },
  '/login': {
    title: '登录 · Walker',
    description: 'Walker 账户入口。',
    heading: '账号',
    indexable: false,
  },
};

/** 解析公开站基址（优先使用显式覆盖 / PUBLIC_SITE_URL，缺省回落标准 www 域名并剥离末尾斜杠） */
export function resolvePublicSiteUrl(override?: string | null): string {
  const raw = override?.trim();
  return (raw || SITE_ORIGIN).replace(/\/+$/, '');
}

/** 构造公开站绝对 URL（自动补前导 `/` 并剥离非根路径末尾斜杠） */
export function siteAbsoluteUrl(pathname: string): string {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${SITE_ORIGIN}${normalized === '/' ? '/' : normalized.replace(/\/$/, '')}`;
}

/** 将文章头图等相对/绝对地址统一归一为完整公开 URL；空值返回空串。 */
export function resolveSiteAssetUrl(asset: string | undefined | null): string {
  const trimmed = asset?.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : siteAbsoluteUrl(trimmed);
}

/** 构造任意公开页面的基础 Schema.org 三节点（WebSite + Person + WebPage）。 */
export function buildCommonJsonLdNodes(
  pathname: string,
  title: string,
  description: string,
): Array<Record<string, unknown>> {
  const url = siteAbsoluteUrl(pathname);
  return [
    {
      '@type': 'WebSite',
      '@id': SITE_WEBSITE_ID,
      url: `${SITE_ORIGIN}/`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: SITE_LANGUAGE,
      publisher: { '@id': SITE_PERSON_ID },
    },
    {
      '@type': 'Person',
      '@id': SITE_PERSON_ID,
      name: SITE_AUTHOR.name,
      url: SITE_AUTHOR.url,
      image: SITE_AUTHOR.image,
    },
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: title,
      description,
      isPartOf: { '@id': SITE_WEBSITE_ID },
      inLanguage: SITE_LANGUAGE,
    },
  ];
}

export function buildCollectionJsonLdNode(options: {
  pathname: string;
  title: string;
  description: string;
  items: ReadonlyArray<{ url: string; name: string }>;
}): Record<string, unknown> {
  const url = siteAbsoluteUrl(options.pathname);
  return {
    '@type': 'CollectionPage',
    '@id': `${url}#collection`,
    url,
    name: options.title,
    description: options.description,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: options.items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: item.url,
        name: item.name,
      })),
    },
  };
}

export function buildAboutPageJsonLdNode(
  pathname: string,
  title: string,
  description: string,
): Record<string, unknown> {
  const url = siteAbsoluteUrl(pathname);
  return {
    '@type': 'AboutPage',
    '@id': `${url}#about`,
    url,
    name: title,
    description,
    about: { '@id': SITE_WEBSITE_ID },
  };
}

export function buildProfilePageJsonLdNode(
  pathname: string,
  title: string,
): Record<string, unknown> {
  const url = siteAbsoluteUrl(pathname);
  return {
    '@type': 'ProfilePage',
    '@id': `${url}#profile`,
    url,
    name: title,
    mainEntity: { '@id': SITE_PERSON_ID },
  };
}

export function wrapJsonLdGraph(
  nodes: readonly Record<string, unknown>[],
): { '@context': 'https://schema.org'; '@graph': readonly Record<string, unknown>[] } {
  return {
    '@context': 'https://schema.org',
    '@graph': nodes,
  };
}

/** 构造文章详情页完整 Schema.org `@graph`（WebSite + WebPage + BlogPosting + Person + BreadcrumbList）。 */
export function buildBlogPostingJsonLdGraph(options: {
  pathname: string;
  browsePath: string;
  browseLabel?: string;
  title: string;
  summary: string;
  published: string;
  modified: string;
  authorName?: string;
  image?: string;
  section: string;
  tags: readonly string[];
}) {
  const canonical = siteAbsoluteUrl(options.pathname);
  const authorName = options.authorName || SITE_AUTHOR.name;
  const image = resolveSiteAssetUrl(options.image);
  const [webSite, person, webPage] = buildCommonJsonLdNodes(options.pathname, options.title, options.summary);
  const articleNode: Record<string, unknown> = {
    '@type': 'BlogPosting',
    '@id': `${canonical}#article`,
    url: canonical,
    mainEntityOfPage: { '@id': `${canonical}#webpage` },
    headline: options.title,
    description: options.summary,
    datePublished: options.published,
    dateModified: options.modified,
    author: { '@id': SITE_PERSON_ID, name: authorName },
    publisher: { '@id': SITE_PERSON_ID },
    inLanguage: SITE_LANGUAGE,
    articleSection: options.section,
    keywords: options.tags,
    isAccessibleForFree: true,
  };
  if (image) articleNode.image = image;

  return wrapJsonLdGraph([
    webSite!,
    { ...webPage!, breadcrumb: { '@id': `${canonical}#breadcrumb` } },
    articleNode,
    { ...person!, name: authorName },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonical}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE_ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: options.browseLabel ?? '文章', item: siteAbsoluteUrl(options.browsePath) },
        { '@type': 'ListItem', position: 3, name: options.title, item: canonical },
      ],
    },
  ]);
}
