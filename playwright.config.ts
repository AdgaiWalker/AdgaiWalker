import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  // 所有 E2E 共享同一个 dev server；TOC 高亮/工作台会话等对滚动与时序敏感，
  // 并发 worker 会互相干扰，统一单 worker 顺序执行。
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4321',
    headless: true,
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
