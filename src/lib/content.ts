import { getCollection } from 'astro:content';

export async function getPublishedPosts() {
  return (await getCollection('log', ({ data }) =>
    data.published && data.type === 'knowledge'
  )).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export async function getPublishedResources() {
  return (await getCollection('log', ({ data }) =>
    data.published && data.type === 'tool'
  )).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export async function getPublishedIdeas() {
  return (await getCollection('log', ({ data }) =>
    data.published && data.type === 'idea'
  )).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export async function getPublishedProjects() {
  return (await getCollection('log', ({ data }) =>
    data.published && data.type === 'project'
  )).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}
