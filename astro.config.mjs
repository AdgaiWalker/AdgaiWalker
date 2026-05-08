// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import icon from 'astro-icon';
import remarkRichEmbed from './src/plugins/remark-rich-embed';

export default defineConfig({
  site: 'https://iwalk.pro',
  output: 'server',
  adapter: vercel(),
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
