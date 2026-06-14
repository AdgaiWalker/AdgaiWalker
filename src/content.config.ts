import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const log = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/log' }),
  schema: ({ image }) => z.object({
    title: z.string(),
    date: z.date(),
    updated: z.date().optional(),
    tags: z.array(z.string()),
    type: z.enum(['knowledge', 'tool', 'idea', 'project', 'community', 'learn', 'learning']),
    form: z.enum(['article', 'note', 'diary', 'rant', 'gallery', 'video', 'recipe', 'calligraphy', 'resource', 'project', 'idea', 'lesson']).optional(),
    domain: z.enum(['ai', 'coding', 'product', 'philosophy', 'life', 'cooking', 'calligraphy', 'reading', 'travel', 'emotion', 'community']).optional(),
    intent: z.enum(['think', 'record', 'teach', 'share', 'verify', 'showcase', 'reflect', 'connect', 'vent']).optional(),
    valueMode: z.enum(['utility', 'existence', 'both']).optional(),
    
    // 学习指南专属元数据字段
    emoji: z.string().optional(),
    subtitle: z.string().optional(),
    level: z.enum(['入门', '学徒', '专家']).optional(),
    yValue: z.string().optional(),
    graduation: z.string().optional(),
    safetyNote: z.string().optional(),
    shareAction: z.string().optional(),

    aiUsePolicy: z.object({
      level: z.enum(['AI-0', 'AI-1', 'AI-2', 'AI-3', 'AI-4']).default('AI-2'),
      readable: z.boolean().default(true),
      citable: z.boolean().default(true),
      actionable: z.boolean().default(false),
      reason: z.string().optional(),
    }).optional(),
    related: z.array(z.string()).default([]),
    published: z.boolean().default(true),
    visibility: z.enum(['public', 'draft', 'private']).optional(),
    featured: z.boolean().optional(),
    summary: z.string().optional(),
    description: z.string().optional(),
    sourceTopicId: z.string().optional(),
    cover: z.union([image(), z.url()]).optional(),
    category: z.string().optional(),
    version: z.number().optional(),
    previousVersion: z.string().optional(),
    series: z.string().optional(),
    seriesOrder: z.number().optional(),
    status: z.enum(['thinking', 'validating', 'building', 'verified', 'archived']).optional(),
    rating: z.number().min(1).max(5).optional(),
    url: z.url().optional(),
    qrCode: z.string().optional(),
    communities: z.array(z.object({
      name: z.string(),
      description: z.string(),
      qrCode: z.string(),
      badge: z.string(),
      tag: z.string(),
    })).optional(),
    videos: z.array(z.object({
      platform: z.enum(['bilibili', 'douyin', 'xiaohongshu', 'youtube', 'github', 'zhihu']),
      url: z.url(),
      title: z.string().optional(),
    })).default([]),
    resources: z.array(z.object({
      name: z.string(),
      url: z.url(),
      type: z.enum(['tool', 'feishu', 'github', 'website', 'download']),
      description: z.string().optional(),
    })).default([]),
  }),
});

export const collections = { log };
