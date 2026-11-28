import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_REDIRECTS } from './routes';

type VercelRedirect = { source: string; destination: string; permanent?: boolean };

const vercel = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../vercel.json'), 'utf8'),
) as { redirects?: VercelRedirect[] };
const redirects = vercel.redirects ?? [];
const legacySources = new Set<string>(LEGACY_REDIRECTS.map((r) => r.source));

describe('LEGACY_REDIRECTS ↔ vercel.json', () => {
  it('每条旧路径在生产都有 301，且落点一致', () => {
    for (const { source, destination } of LEGACY_REDIRECTS) {
      const hit = redirects.find((r) => r.source === source);
      expect(hit, `vercel.json 缺少 ${source}`).toBeTruthy();
      expect(hit!.destination).toBe(destination);
      expect(hit!.permanent).toBe(true);
    }
  });

  it('没有任何 301 再落到另一个旧路径（禁止跳转链）', () => {
    for (const r of redirects) {
      const target = r.destination.split(/[?#]/)[0]!;
      expect(legacySources.has(target), `${r.source} → ${r.destination} 形成跳转链`).toBe(false);
    }
  });
});
