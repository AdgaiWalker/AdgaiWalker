import { describe, expect, it } from 'vitest';
import {
  SITE_AUTHOR,
  SITE_DEFAULT_IMAGE,
  SITE_LANGUAGE,
  SITE_ORIGIN,
  SITE_PERSON_ID,
  SITE_ROUTE_METADATA,
  SITE_WEBSITE_ID,
  buildBlogPostingJsonLdGraph,
  buildCollectionJsonLdNode,
  buildCommonJsonLdNodes,
  resolveSiteAssetUrl,
  siteAbsoluteUrl,
} from './site-identity.js';

describe('site-identity 单一真相源与 JSON-LD 构图', () => {
  it('siteAbsoluteUrl 与 resolveSiteAssetUrl 规范前导斜杠、末尾斜杠与外链', () => {
    expect(siteAbsoluteUrl('/')).toBe(`${SITE_ORIGIN}/`);
    expect(siteAbsoluteUrl('posts/demo/')).toBe(`${SITE_ORIGIN}/posts/demo`);
    expect(siteAbsoluteUrl('/explore')).toBe(`${SITE_ORIGIN}/explore`);
    expect(resolveSiteAssetUrl('')).toBe('');
    expect(resolveSiteAssetUrl('  ')).toBe('');
    expect(resolveSiteAssetUrl('/images/cover.png')).toBe(`${SITE_ORIGIN}/images/cover.png`);
    expect(resolveSiteAssetUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(SITE_DEFAULT_IMAGE).toBe(`${SITE_ORIGIN}/images/hero-bg.png`);
  });

  it('buildCommonJsonLdNodes 产出同一套 WebSite + Person + WebPage 节点', () => {
    const nodes = buildCommonJsonLdNodes('/about', '关于本站 · Walker', '简介');
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toMatchObject({ '@type': 'WebSite', '@id': SITE_WEBSITE_ID, inLanguage: SITE_LANGUAGE });
    expect(nodes[1]).toMatchObject({ '@type': 'Person', '@id': SITE_PERSON_ID, name: SITE_AUTHOR.name });
    expect(nodes[2]).toMatchObject({ '@type': 'WebPage', '@id': `${SITE_ORIGIN}/about#webpage`, url: `${SITE_ORIGIN}/about` });
  });

  it('buildCollectionJsonLdNode 与 buildBlogPostingJsonLdGraph 保持完整必填字段', () => {
    const col = buildCollectionJsonLdNode({
      pathname: '/posts',
      title: '文章 · Walker',
      description: '公开文章',
      items: [{ url: `${SITE_ORIGIN}/posts/a`, name: 'A' }],
    });
    expect(col).toMatchObject({
      '@type': 'CollectionPage',
      '@id': `${SITE_ORIGIN}/posts#collection`,
      mainEntity: { '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'A' }] },
    });

    const blogGraph = buildBlogPostingJsonLdGraph({
      pathname: '/posts/a',
      browsePath: '/posts',
      title: 'A',
      summary: '摘要',
      published: '2026-11-24T00:00:00.000Z',
      modified: '2026-11-24T00:00:00.000Z',
      image: '/images/hero.png',
      section: 'thinking',
      tags: ['arch'],
    });
    expect(blogGraph['@context']).toBe('https://schema.org');
    expect(blogGraph['@graph'].map((n) => n['@type'])).toEqual([
      'WebSite', 'WebPage', 'BlogPosting', 'Person', 'BreadcrumbList',
    ]);
    expect(blogGraph['@graph'][0]).toMatchObject({
      '@type': 'WebSite',
      publisher: { '@id': SITE_PERSON_ID },
    });
    expect(blogGraph['@graph'][2]).toMatchObject({
      image: `${SITE_ORIGIN}/images/hero.png`,
      headline: 'A',
      inLanguage: SITE_LANGUAGE,
    });
    expect(blogGraph['@graph'][4]).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        expect.objectContaining({ position: 1 }),
        expect.objectContaining({ position: 2, name: '文章' }),
        expect.objectContaining({ position: 3, name: 'A' }),
      ],
    });
    expect(SITE_ROUTE_METADATA['/posts']?.title).toBe('文章 · Walker');
    expect(SITE_ROUTE_METADATA['/tools']?.title).toBe('提问 · Walker');
    expect(SITE_ROUTE_METADATA['/ask']?.title).toBe('小影 · Walker');
  });
});
