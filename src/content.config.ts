import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const log = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/log' }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    tags: z.array(z.string()),
    category: z.enum(['ai', 'life']),
    type: z.enum(['article', 'thought', 'photo', 'project', 'idea']),
    published: z.boolean().default(true),
    summary: z.string().optional(),
    description: z.string().optional(),
    cover: z.string().optional(),

    // Idea 专属字段
    status: z.enum(['open', 'completed']).optional(),
    claimInfo: z.string().optional(),

    videos: z.array(z.object({
      platform: z.enum(['bilibili', 'douyin', 'xiaohongshu', 'youtube', 'github', 'zhihu']),
      url: z.string().url(),
      title: z.string().optional(),
    })).default([]),
    resources: z.array(z.object({
      name: z.string(),
      url: z.string().url(),
      type: z.enum(['tool', 'feishu', 'github', 'website', 'download']),
      description: z.string().optional(),
    })).default([]),
  }),
});

const dockItem = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/dock' }),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    category: z.enum(['tool', 'skill', 'info-source', 'community']),
    tags: z.array(z.string()),
    rating: z.number().min(1).max(5).optional(),
    url: z.string().url().optional(),
    published: z.boolean().default(true),
  }),
});

export const collections = { log, dockItem };

