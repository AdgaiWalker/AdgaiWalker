/**
 * 赞赏配置 — JSON 文件实现（content/support-config.json）
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_SUPPORT_CONFIG,
  type SupportConfig,
  type SupportConfigRepositoryPort,
} from '../ports/support-config.repository';

async function resolvePath(): Promise<string> {
  const fromEnv = process.env.SUPPORT_CONFIG_PATH?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  const candidates = [
    path.resolve(process.cwd(), 'content/support-config.json'),
    path.resolve(process.cwd(), '../../content/support-config.json'),
  ];
  for (const c of candidates) {
    try {
      await fs.access(path.dirname(c));
      return c;
    } catch {
      /* next */
    }
  }
  return candidates[0]!;
}

export class FsSupportConfigRepository implements SupportConfigRepositoryPort {
  async get(): Promise<SupportConfig> {
    const file = await resolvePath();
    try {
      const raw = await fs.readFile(file, 'utf8');
      const data = JSON.parse(raw) as Partial<SupportConfig>;
      return {
        ...DEFAULT_SUPPORT_CONFIG,
        ...data,
        externalLinks: Array.isArray(data.externalLinks)
          ? data.externalLinks
          : [],
      };
    } catch {
      return { ...DEFAULT_SUPPORT_CONFIG };
    }
  }

  async save(config: SupportConfig): Promise<SupportConfig> {
    const file = await resolvePath();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const next: SupportConfig = {
      title: config.title?.trim() || DEFAULT_SUPPORT_CONFIG.title,
      body: config.body?.trim() || DEFAULT_SUPPORT_CONFIG.body,
      wechatQrUrl: config.wechatQrUrl?.trim() || '',
      alipayQrUrl: config.alipayQrUrl?.trim() || '',
      externalLinks: Array.isArray(config.externalLinks)
        ? config.externalLinks.filter((l) => l.label && l.url)
        : [],
    };
    await fs.writeFile(file, JSON.stringify(next, null, 2) + '\n', 'utf8');
    return next;
  }
}
