import { getCollection } from 'astro:content';

import { toContentItem } from '@/lib/content-model';

function sortByDateDescending<T extends { data: { date: Date } }>(entries: T[]) {
  return entries.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export async function getPublishedContentItems() {
  return sortByDateDescending(await getCollection('log', ({ data }) => data.published))
    .map(toContentItem);
}

export async function getPublishedPosts() {
  return sortByDateDescending(await getCollection('log', ({ data }) =>
    data.published && ['knowledge', 'idea', 'project', 'learn', 'learning'].includes(data.type)
  ));
}

export async function getPublishedResources() {
  return sortByDateDescending(await getCollection('log', ({ data }) =>
    data.published && data.type === 'tool'
  ));
}

export async function getPublishedIdeas() {
  return sortByDateDescending(await getCollection('log', ({ data }) =>
    data.published && data.type === 'idea'
  ));
}

export async function getPublishedProjects() {
  return sortByDateDescending(await getCollection('log', ({ data }) =>
    data.published && data.type === 'project'
  ));
}

/**
 * 获取某篇文章的完整版本链（按版本号升序）
 * 返回包含当前文章在内的所有版本
 */
export function getVersionChain<T extends { id: string; data: { version?: number; previousVersion?: string } }>(
  allEntries: T[],
  currentSlug: string,
): T[] {
  const current = allEntries.find(e => e.id === currentSlug);
  if (!current) return [];

  // 没有任何版本信息，返回空
  const hasVersion = current.data.version !== undefined;
  const isReferenced = allEntries.some(e => e.data.previousVersion === currentSlug);
  if (!hasVersion && !isReferenced) return [];

  // 收集所有版本：通过 previousVersion 链构建关系图
  const byPrevious = new Map<string, T[]>();
  for (const e of allEntries) {
    if (e.data.previousVersion) {
      const list = byPrevious.get(e.data.previousVersion) || [];
      list.push(e);
      byPrevious.set(e.data.previousVersion, list);
    }
  }

  // 找到链头（没有任何文章指向它为 previousVersion 的版本号最小的文章）
  const chain: T[] = [];
  let head: T | undefined;
  const maxDepth = allEntries.length; // 循环引用安全限制

  if (current.data.version === 1 || !current.data.previousVersion) {
    head = current;
  } else {
    // 向前追溯
    let cur: T | undefined = current;
    let depth = 0;
    while (cur?.data.previousVersion && depth++ < maxDepth) {
      const prev = allEntries.find(e => e.id === cur!.data.previousVersion);
      if (!prev) break;
      cur = prev;
    }
    head = cur;
  }

  if (!head) return [current];

  // 从链头开始向后遍历（线性链：每个版本只取第一个指向它的后续版本）
  let node: T | undefined = head;
  let depth = 0;
  while (node && depth++ < maxDepth) {
    chain.push(node);
    const next: T | undefined = byPrevious.get(node.id)?.[0];
    node = next;
  }

  return chain;
}

/**
 * 获取某个系列的所有文章（按 seriesOrder 升序）
 */
export function getSeriesEntries<T extends { data: { series?: string; seriesOrder?: number } }>(
  allEntries: T[],
  seriesName: string,
): T[] {
  return allEntries
    .filter(e => e.data.series === seriesName)
    .sort((a, b) => (a.data.seriesOrder ?? 0) - (b.data.seriesOrder ?? 0));
}
