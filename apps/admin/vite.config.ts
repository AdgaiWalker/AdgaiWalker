import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 新后台仅通过同源 API 代理读取本站数据。
export default defineConfig({
  plugins: [react()],
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
