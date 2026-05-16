// astro.config.mjs
import { defineConfig, fontProviders } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import icon from 'astro-icon';
import remarkRichEmbed from './src/plugins/remark-rich-embed.ts';

export default defineConfig({
  site: 'https://iwalk.pro',
  output: 'server',
  adapter: vercel({
    imageService: true,
    imagesConfig: {
      sizes: [320, 640, 960, 1280],
    },
  }),
  prefetch: {
    defaultStrategy: 'hover',
  },
  fonts: [
    {
      name: 'Inter',
      cssVariable: '--font-body',
      provider: fontProviders.fontsource(),
      weights: ['300', '400', '500', '600', '700'],
      styles: ['normal'],
      subsets: ['latin'],
    },
    {
      name: 'Sora',
      cssVariable: '--font-heading',
      provider: fontProviders.fontsource(),
      weights: ['300', '400', '500', '600', '700'],
      styles: ['normal'],
      subsets: ['latin'],
    },
    {
      name: 'JetBrains Mono',
      cssVariable: '--font-mono',
      provider: fontProviders.fontsource(),
      weights: ['400', '700'],
      styles: ['normal'],
      subsets: ['latin'],
    },
    {
      name: 'Noto Sans SC',
      cssVariable: '--font-cjk',
      provider: fontProviders.fontsource(),
      weights: ['300', '400', '500', '700'],
      styles: ['normal'],
      subsets: ['chinese-simplified'],
    },
  ],
  experimental: {
    svgo: true,
  },
  integrations: [
    mdx(),
    sitemap(),
    icon(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    remarkPlugins: [remarkRichEmbed],
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
