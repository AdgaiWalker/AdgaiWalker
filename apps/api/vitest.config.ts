import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';

// 加载 apps/api/.env 供本地默认值，但 DATABASE_URL 一律改写到独立测试库：
// 测试绝不写开发库（apps/api/data/walker.db）或生产库。
// 要显式指定库（如 PG CI）时设 API_TEST_DB_URL，此时本文件不再覆盖。
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
process.env.DATABASE_URL = testDbUrl;
process.env.WALKER_DB_PROVIDER = testDbUrl.startsWith('file:') ? 'sqlite' : 'postgresql';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 30000,
    globalSetup: ['./vitest.global-setup.ts'],
  },
});
