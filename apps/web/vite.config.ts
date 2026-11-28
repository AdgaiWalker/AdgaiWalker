import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.dirname(fileURLToPath(import.meta.url));

function resolveBuildVersion(): string {
  const fromEnv =
    process.env.WALKER_BUILD_VERSION?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim().slice(0, 7);
  if (fromEnv) return fromEnv;
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim() || 'dev';
  } catch {
    return 'dev';
  }
}

/** 生成静态 dist/version.json（dev 中同路径返回），让静态站切回时能静默提示更新。 */
function emitVersionJson(version: string): Plugin {
  const payload = `${JSON.stringify({ version })}\n`;
  return {
    name: 'web-version-json',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(payload);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: payload });
    },
  };
}

const buildVersion = resolveBuildVersion();

export default defineConfig({
  plugins: [react(), emitVersionJson(buildVersion)],
  publicDir: path.resolve(root, '../../public'),
  define: {
    __WEB_BUILD_VERSION__: JSON.stringify(buildVersion),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-router')) return 'vendor-router';
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/scheduler')
          ) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          if (id.includes('node_modules/marked') || id.includes('node_modules/dompurify')) {
            return 'vendor-markdown';
          }
          if (id.includes('/src/generated/content.json')) return 'data-content';
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@walker/shared': path.resolve(root, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: false,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
    fs: {
      allow: [root, path.resolve(root, '../..')],
    },
  },
});
