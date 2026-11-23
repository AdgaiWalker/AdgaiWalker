import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function resolveBuildVersion(): string {
  const fromEnv = process.env.WALKER_BUILD_VERSION?.trim();
  if (fromEnv) return fromEnv;
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim() || 'dev';
  } catch {
    return 'dev';
  }
}

/** 产出静态 dist/version.json（并在 dev 中同路径响应），让前端版本漂移检测与 API /health 解耦。 */
function emitVersionJson(version: string): Plugin {
  const payload = JSON.stringify({ version }) + '\n';
  return {
    name: 'admin-version-json',
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

// 新后台仅通过同源 API 代理读取本站数据。
export default defineConfig({
  plugins: [react(), emitVersionJson(buildVersion)],
  define: {
    __ADMIN_BUILD_VERSION__: JSON.stringify(buildVersion),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-router')) return 'vendor-router';
          if (id.includes('node_modules/@tanstack/')) return 'vendor-query';
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/scheduler')
          ) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          return undefined;
        },
      },
    },
  },
  resolve: { alias: { '@walker/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) } },
  server: {
    host: '127.0.0.1',
    port: 5174,
    // 2026-10-29：站主要用 admin.iwalk.pro 打开后台，cloudflared 把该域名转到本机 5174。
    // 浏览器带的是 Host: admin.iwalk.pro，Vite 默认只认 localhost/127.0.0.1，会直接 403
    // "Blocked request. This host is not allowed."——不是 CF 拦的，也不是 API 拦的。
    // 只放行这一个域名，不写宽泛通配。
    allowedHosts: ['admin.iwalk.pro'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: false,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
