import { getCollection } from 'astro:content';

export async function getPublishedPosts() {
  return (await getCollection('log', ({ data }) =>
    data.published && data.type === 'knowledge'
  )).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export async function getPublishedTools() {
  return (await getCollection('log', ({ data }) =>
    data.published && (data.type === 'tool' || data.type === 'idea')
  )).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}
