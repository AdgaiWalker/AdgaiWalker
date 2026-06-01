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
