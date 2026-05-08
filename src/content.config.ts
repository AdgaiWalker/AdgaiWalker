import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const log = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/log' }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    tags: z.array(z.string()),
    type: z.enum(['article', 'photo', 'thought', 'project', 'dialogue']),
    domain: z.enum(['ai-exploration', 'ai-life']).default('ai-exploration'),
    published: z.boolean().default(true),
    summary: z.string().optional(),
    description: z.string().optional(),
    cover: z.string().optional(),
    link: z.string().url().optional(),
  }),
});

const idea = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/idea' }),
  schema: z.object({
    title: z.string(),
    scenario: z.string(),
    tags: z.array(z.string()),
    status: z.literal('open').default('open'),
    followups: z.array(z.object({
      who: z.string(),
      status: z.enum(['exploring', 'building', 'shipped']),
      note: z.string().optional(),
    })).default([]),
    published: z.boolean().default(true),
    date: z.date(),
  }),
});

const dockItem = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/dock' }),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    category: z.enum(['skill', 'tool', 'info-source']),
    tags: z.array(z.string()),
    rating: z.number().min(1).max(5).optional(),
    url: z.string().url().optional(),
    published: z.boolean().default(true),
  }),
});

const work = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/works' }),
  schema: z.object({
    title: z.string(),
    platform: z.enum(['bilibili', 'douyin', 'xiaohongshu', 'zhihu', 'github']),
    url: z.string().url(),
    cover: z.string().optional(),
    description: z.string(),
    tags: z.array(z.string()),
    date: z.date(),
    published: z.boolean().default(true),
  }),
});

export const collections = { log, idea, dockItem, work };
