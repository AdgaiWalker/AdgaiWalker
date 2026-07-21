/**
 * puppeteer-launch — 本机 Chrome for Testing / 系统 puppeteer 启动
 * 依赖：node:fs、node:path、createRequire
 * 被调用：accept-dual-entry、accept-deep（浏览器段）
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

export type BrowserLike = {
  newPage: () => Promise<PageLike>;
  close: () => Promise<void>;
};

/** 宽松页接口：仅约束验收脚本实际用到的方法，实现由 puppeteer 提供 */
export type PageLike = {
  goto: (url: string, opts?: Record<string, unknown>) => Promise<unknown>;
  type: (sel: string, text: string) => Promise<void>;
  click: (sel: string) => Promise<void>;
  focus: (sel: string) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evaluate: <T = unknown>(fn: (...args: any[]) => T | Promise<T>, ...args: unknown[]) => Promise<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $eval: <T = unknown>(sel: string, fn: (el: any) => T) => Promise<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $$eval: <T = unknown>(sel: string, fn: (els: any[]) => T) => Promise<T>;
  $: (sel: string) => Promise<{ click: () => Promise<void> } | null>;
  waitForFunction: (fn: () => boolean, opts?: Record<string, unknown>) => Promise<unknown>;
  waitForSelector: (sel: string, opts?: Record<string, unknown>) => Promise<unknown>;
  setViewport: (vp: Record<string, unknown>) => Promise<void>;
  reload: (opts?: Record<string, unknown>) => Promise<unknown>;
  on: (event: string, handler: (e: Error) => void) => void;
  createCDPSession: () => Promise<{ send: (method: string) => Promise<unknown> }>;
};

const HOME = process.env.HOME || '';

/** 可探测的 Chrome 路径（环境变量优先） */
const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  path.join(
    HOME,
    '.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  ),
  path.join(
    HOME,
    '.cache/puppeteer/chrome/mac-150.0.7871.24/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  ),
].filter((p): p is string => Boolean(p && p.length > 0));

function resolveChromePath(): string | undefined {
  for (const candidate of CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function loadPuppeteer(): {
  launch: (opts: Record<string, unknown>) => Promise<BrowserLike>;
} {
  const candidates = [
    path.join(HOME, '.local/node/lib/node_modules/devloop-mcp/package.json'),
    path.join(HOME, '.local/node/lib/node_modules/puppeteer/package.json'),
  ];
  for (const pkg of candidates) {
    if (!fs.existsSync(pkg)) continue;
    try {
      const require = createRequire(pkg);
      return require('puppeteer') as {
        launch: (opts: Record<string, unknown>) => Promise<BrowserLike>;
      };
    } catch {
      /* try next */
    }
  }
  throw new Error(
    '无法加载 puppeteer：请安装 puppeteer 或设置 PUPPETEER_EXECUTABLE_PATH，并确保 devloop-mcp/puppeteer 可 require',
  );
}

export async function launchBrowser(viewport?: {
  width: number;
  height: number;
}): Promise<BrowserLike> {
  const puppeteer = loadPuppeteer();
  const executablePath = resolveChromePath();

  return puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      ...(viewport ? [`--window-size=${viewport.width},${viewport.height}`] : []),
    ],
    defaultViewport: viewport ?? { width: 1280, height: 900 },
  });
}
