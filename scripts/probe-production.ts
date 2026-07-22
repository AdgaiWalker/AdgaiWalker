/**
 * probe-production — 生产域名黑盒探针（只读）
 * 依赖：node https；无密钥
 * 触发：pnpm exec tsx scripts/probe-production.ts
 * 实现：打印 path → status / spa_root，供 s1-go-live 对齐
 */
import https from 'node:https';

const BASE = process.env.PROBE_BASE ?? 'https://www.iwalk.pro';
const PATHS = [
  '/',
  '/tools',
  '/posts',
  '/api/health',
  '/health',
  '/rss.xml',
  '/llms.txt',
  '/pagefind/pagefind.js',
  '/posts/design-for-people',
];

function get(path: string): Promise<{ status: number; body: string; ct: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    https
      .get(
        url,
        { headers: { 'user-agent': 'walker-probe-production/1.0' }, timeout: 15000 },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            resolve({
              status: res.statusCode ?? 0,
              body: Buffer.concat(chunks).toString('utf8').slice(0, 500),
              ct: String(res.headers['content-type'] ?? ''),
            });
          });
        },
      )
      .on('error', reject);
  });
}

async function main() {
  console.log('probe_base', BASE);
  console.log('probe_at', new Date().toISOString());
  for (const p of PATHS) {
    try {
      const r = await get(p);
      const spa = r.body.includes('id="root"') || r.body.includes("id='root'");
      console.log(
        `STATUS ${r.status} path=${p} ct=${r.ct.slice(0, 36)} spa_root=${spa}`,
      );
    } catch (e) {
      console.log(`STATUS ERR path=${p} err=${(e as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
