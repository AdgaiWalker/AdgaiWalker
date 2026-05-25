import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const log = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/log' }),
  schema: ({ image }) => z.object({
    title: z.string(),
    date: z.date(),
    tags: z.array(z.string()),
    type: z.enum(['knowledge', 'tool', 'idea', 'project']),
    published: z.boolean().default(true),
    summary: z.string().optional(),
    description: z.string().optional(),
    cover: z.union([image(), z.url()]).optional(),
    category: z.string().optional(),
    status: z.enum(['thinking', 'practicing', 'verified', 'archived']).optional(),
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
