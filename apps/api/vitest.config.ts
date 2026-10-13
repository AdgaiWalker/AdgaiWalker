import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';

// 加载 apps/api/.env 供本地默认值，但 DATABASE_URL 一律改写到独立测试库：
// 测试绝不写开发库（apps/api/data/walker.db）或生产库。
// API_TEST_DB_URL 仅接受绝对路径、以 .test.db 结尾的独立 SQLite 测试文件。
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      let value = m[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[m[1].trim()] = value;
    }
  }
}

const testDbUrl =
  process.env.API_TEST_DB_URL?.trim() ||
  `file:${path.join(__dirname, 'data', 'walker.test.db')}`;
if (!testDbUrl.startsWith('file:') || !path.isAbsolute(testDbUrl.slice(5)) || !testDbUrl.endsWith('.test.db')) {
  throw new Error('API_TEST_DB_URL 必须是绝对路径的独立 SQLite .test.db 文件');
}
process.env.DATABASE_URL = testDbUrl;
process.env.WALKER_DB_PROVIDER = 'sqlite';
// G03 资源门禁：测试机（CI/开发 Mac）余量不代表 2C2G 目标盒子，显式解除该门；
// 生产默认仍为 512MB（resolveMinFreeMemoryMb 无覆盖时取默认）。这是运维配置路径，不是兼容代码。
if (!process.env.WALKER_MEMORY_HEADROOM_MB) {
  process.env.WALKER_MEMORY_HEADROOM_MB = '0';
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 30000,
    fileParallelism: false,
    globalSetup: ['./vitest.global-setup.ts'],
  },
});
