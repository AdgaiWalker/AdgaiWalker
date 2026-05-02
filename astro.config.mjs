// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import remarkDialogueCallouts from './src/plugins/remark-dialogue-callouts.mjs';

export default defineConfig({
  site: 'https://walker.blog',
  integrations: [
    mdx({
      remarkPlugins: [remarkDialogueCallouts],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    remarkPlugins: [remarkDialogueCallouts],
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
