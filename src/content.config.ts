import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const concepts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/concepts' }),
  schema: z.object({
    title: z.string(),
    type: z.literal('concept'),
    symbol: z.string().optional(),
    domain: z.array(z.string()),
    related: z.array(z.string()).default([]),
    layer: z.number().min(1).max(5).optional(),
    status: z.enum(['active', 'archived', 'draft']).default('active'),
  }),
});

const log = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/log' }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    tags: z.array(z.string()),
    type: z.enum([
      'article', 'photo', 'thought', 'project', 'dialogue',
      'recipe', 'video', 'audio', 'gallery', 'prompt',
    ]),
    published: z.boolean().default(true),
    cover: z.string().optional(),
    link: z.string().optional(),
    source: z.string().optional(),
    concepts: z.array(z.string()).default([]),
  }),
});

export const collections = { concepts, log };
