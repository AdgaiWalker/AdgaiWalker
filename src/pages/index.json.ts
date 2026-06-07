import type { APIRoute } from 'astro';

import { getPublishedContentItems } from '@/knowledge/content';

export const prerender = true;

const SITE_URL = 'https://iwalk.pro';
const GENERATED_AT = 'build-time';

function absoluteUrl(path: string) {
  return `${SITE_URL}${path}`;
}

function serializeDate(date?: Date) {
  return date?.toISOString() ?? null;
}

export const GET: APIRoute = async () => {
  const items = await getPublishedContentItems();

  const body = {
    generatedAt: GENERATED_AT,
    site: {
      title: 'Walker / 秋知 / AdgaiWalker',
      url: SITE_URL,
      language: 'zh-CN',
      description: 'Walker 的个人空间与数字花园，记录 AI 探索、独立开发、点子、工具、项目与生活现场。',
      northStar: '用点子连接人与 AI，也连接人与人；人决策，AI 执行。',
    },
    style: '/walker-style.md',
    contentEntry: '/content',
    content: items.map((item) => ({
      id: item.id,
      title: item.title,
      url: item.isExternal ? item.href : absoluteUrl(item.href),
      summary: item.summary ?? '',
      date: serializeDate(item.date),
      updated: serializeDate(item.updated),
      tags: item.tags,
      type: item.type,
      form: item.form,
      domain: item.domain,
      intent: item.intent,
      valueMode: item.valueMode,
      status: item.status ?? null,
      aiUseLevel: item.aiUseLevel,
      related: item.related,
      version: item.version ?? null,
      previousVersion: item.previousVersion ?? null,
      series: item.series ?? null,
      seriesOrder: item.seriesOrder ?? null,
    })),
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
